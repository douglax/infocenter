// Zero-dependency dashboard server: serves ./public and fetches widget data server-side (no CORS issues, cached).
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const CONFIG_PATH = process.env.CONFIG_PATH || path.join(__dirname, 'config.json');
const PUBLIC = path.join(__dirname, 'public');
const UA = 'infocenter-dashboard/1.0 (personal use)';
const cache = new Map();

const LOCAL_PATH = process.env.CONFIG_LOCAL_PATH || path.join(path.dirname(CONFIG_PATH), 'config.local.json');

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const merge = (a, b) => {
  if (!isObj(a) || !isObj(b)) return b;
  const out = { ...a };
  for (const k of Object.keys(b)) out[k] = merge(a[k], b[k]);
  return out;
};

// config.json is the shareable base; the untracked config.local.json overrides it.
// In the local file, "widgets" is an object keyed by widget id and is deep-merged into the matching widget.
function readConfig() {
  const base = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  if (!fs.existsSync(LOCAL_PATH)) return base;
  const { widgets: overrides = {}, ...rest } = JSON.parse(fs.readFileSync(LOCAL_PATH, 'utf8'));
  const cfg = merge(base, rest);
  cfg.widgets = (base.widgets || []).map((w) => merge(w, overrides[w.id] || {}));
  return cfg;
}

async function get(url, as = 'json') {
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${new URL(url).host} responded ${r.status}`);
  return as === 'json' ? r.json() : r.text();
}

// ---------- weather (Open-Meteo, no key) ----------
async function weather(o) {
  const units = o.units === 'metric' ? 'metric' : 'imperial';
  const u = new URL('https://api.open-meteo.com/v1/forecast');
  u.search = new URLSearchParams({
    latitude: o.lat, longitude: o.lon, timezone: 'auto', forecast_days: 6,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    temperature_unit: units === 'metric' ? 'celsius' : 'fahrenheit',
    wind_speed_unit: units === 'metric' ? 'kmh' : 'mph',
  });
  const d = await get(u);
  return { name: o.name || '', units, current: d.current, daily: d.daily };
}

// ---------- RSS / Atom ----------
const decode = (s = '') => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, '&').trim();
const tag = (x, t) => (x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, 'i')) || [])[1];

async function news(o) {
  const feeds = o.feeds || [];
  const results = await Promise.allSettled(feeds.map(async (f) => {
    const url = typeof f === 'string' ? f : f.url;
    const xml = await get(url, 'text');
    const src = decode(tag(xml.replace(/<item[\s\S]*|<entry[\s\S]*/i, ''), 'title')) || new URL(url).host;
    const items = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || [];
    return items.slice(0, 15).map((it) => {
      const link = (it.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || decode(tag(it, 'link'));
      const date = new Date(decode(tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || ''));
      const raw = it.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
      const image = (raw.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i) || raw.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i) || raw.match(/<img[^>]*src="([^"]+)"/i) || [])[1];
      const summary = decode(tag(it, 'description') || tag(it, 'summary') || '').slice(0, 300);
      return {
        title: decode(tag(it, 'title')), link, image, summary, source: (typeof f === 'object' && f.name) || src,
        time: isNaN(date) ? null : date.toISOString(),
      };
    });
  }));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
    .sort((a, b) => (b.time || '').localeCompare(a.time || ''));
  if (!items.length && results.length) throw new Error('No feeds could be loaded');
  return { items: items.slice(0, o.limit || 15) };
}

// ---------- Calendar (ICS: Google/iCloud/Outlook "secret address" URLs) ----------
function icsDate(v, params = '') {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/);
  if (!m) return null;
  const allDay = !m[4];
  const [, y, mo, d, h = 0, mi = 0, s = 0, z] = m;
  const date = z ? new Date(Date.UTC(y, mo - 1, d, h, mi, s)) : new Date(y, mo - 1, d, h, mi, s);
  return { date, allDay };
}
const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function* occurrences(start, rrule, until) {
  if (!rrule) { yield start; return; }
  const r = Object.fromEntries(rrule.split(';').map((p) => p.split('=')));
  const step = parseInt(r.INTERVAL || 1, 10);
  const limit = Math.min(r.UNTIL ? (icsDate(r.UNTIL)?.date ?? until) : until, until);
  const max = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  let n = 0;
  const byday = r.BYDAY ? r.BYDAY.split(',').map((d) => DAYS.indexOf(d.slice(-2))) : null;
  const cur = new Date(start);
  for (let guard = 0; guard < 5000 && cur <= limit && n < max; guard++) {
    if (r.FREQ === 'WEEKLY' && byday) {
      const wk = new Date(cur); wk.setDate(wk.getDate() - wk.getDay());
      for (const dow of [...byday].sort()) {
        const o = new Date(wk); o.setDate(wk.getDate() + dow);
        o.setHours(start.getHours(), start.getMinutes(), start.getSeconds());
        if (o >= start && o <= limit && n < max) { n++; yield o; }
      }
      cur.setDate(cur.getDate() + 7 * step);
      continue;
    }
    n++; yield new Date(cur);
    if (r.FREQ === 'DAILY') cur.setDate(cur.getDate() + step);
    else if (r.FREQ === 'WEEKLY') cur.setDate(cur.getDate() + 7 * step);
    else if (r.FREQ === 'MONTHLY') cur.setMonth(cur.getMonth() + step);
    else if (r.FREQ === 'YEARLY') cur.setFullYear(cur.getFullYear() + step);
    else return;
  }
}

async function calendar(o) {
  const now = new Date();
  const horizon = new Date(now.getTime() + (o.days || 14) * 864e5);
  const events = [];
  const results = await Promise.allSettled((o.calendars || []).map(async (c) => {
    const text = (await get(c.url, 'text')).replace(/\r?\n[ \t]/g, '');
    for (const block of text.split('BEGIN:VEVENT').slice(1)) {
      const body = block.split('END:VEVENT')[0];
      const prop = (n) => {
        const m = body.match(new RegExp(`^${n}((?:;[^:\\n]*)?):(.*)$`, 'm'));
        return m ? { params: m[1], value: m[2].trim() } : null;
      };
      const s = prop('DTSTART'); if (!s) continue;
      const st = icsDate(s.value, s.params); if (!st) continue;
      const e = prop('DTEND');
      const en = e ? icsDate(e.value, e.params) : null;
      const dur = en ? en.date - st.date : (st.allDay ? 864e5 : 0);
      const ex = new Set([...body.matchAll(/^EXDATE[^:\n]*:(.*)$/gm)]
        .flatMap((m) => m[1].split(',')).map((v) => icsDate(v.trim())?.date.getTime()));
      const title = (prop('SUMMARY')?.value || '(no title)').replace(/\\([,;])/g, '$1').replace(/\\n/g, ' ');
      const loc = prop('LOCATION')?.value.replace(/\\([,;])/g, '$1');
      for (const occ of occurrences(st.date, prop('RRULE')?.value, horizon)) {
        const end = new Date(occ.getTime() + dur);
        if (end < now && !(st.allDay && occ.toDateString() === now.toDateString())) continue;
        if (occ > horizon || ex.has(occ.getTime())) continue;
        events.push({ title, start: occ.toISOString(), end: end.toISOString(), allDay: st.allDay, location: loc, color: c.color, calendar: c.name });
      }
    }
  }));
  if (results.length && results.every((r) => r.status === 'rejected')) throw results[0].reason;
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events: events.slice(0, o.limit || 20) };
}

// ---------- Sports (ESPN public scoreboard JSON) ----------
async function sports(o) {
  const games = [];
  await Promise.allSettled((o.leagues || []).map(async (lg) => {
    const league = typeof lg === 'string' ? lg : lg.league; // e.g. "football/nfl"
    const teams = (typeof lg === 'object' && lg.teams || []).map((t) => t.toLowerCase());
    const d = await get(`https://site.api.espn.com/apis/site/v2/sports/${league}/scoreboard`);
    for (const ev of d.events || []) {
      const comp = ev.competitions?.[0]; if (!comp) continue;
      const cs = comp.competitors || [];
      if (teams.length && !cs.some((c) => teams.includes(c.team.abbreviation.toLowerCase()))) continue;
      const side = (c) => ({ name: c.team.shortDisplayName || c.team.displayName, abbr: c.team.abbreviation, score: c.score, logo: c.team.logo, winner: c.winner });
      const home = cs.find((c) => c.homeAway === 'home') || cs[0];
      const away = cs.find((c) => c.homeAway === 'away') || cs[1];
      games.push({
        league: d.leagues?.[0]?.abbreviation || league, date: ev.date,
        state: ev.status.type.state, status: ev.status.type.shortDetail,
        home: side(home), away: side(away),
      });
    }
  }));
  const rank = { in: 0, pre: 1, post: 2 };
  games.sort((a, b) => rank[a.state] - rank[b.state] || a.date.localeCompare(b.date));
  return { games: games.slice(0, o.limit || 12) };
}

// ---------- Stocks / crypto tickers (Yahoo Finance chart endpoint, no key) ----------
async function stocks(o) {
  const out = await Promise.allSettled((o.symbols || []).map(async (s) => {
    const d = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=15m`);
    const m = d.chart.result[0].meta;
    const prev = m.chartPreviousClose ?? m.previousClose;
    return { symbol: s, name: m.shortName || s, price: m.regularMarketPrice, change: m.regularMarketPrice - prev, pct: ((m.regularMarketPrice - prev) / prev) * 100, currency: m.currency };
  }));
  const items = out.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!items.length && out.length) throw new Error('No quotes available');
  return { items };
}

// ---------- Flights overhead (adsb.lol, open ADS-B data, no key) ----------
async function flights(o) {
  const radius = Math.min(o.radiusNm || 25, 250);
  const d = await get(`https://api.adsb.lol/v2/point/${o.lat}/${o.lon}/${radius}`);
  const rad = (x) => (x * Math.PI) / 180;
  const dist = (a) => { // nautical miles (haversine)
    const dl = rad(a.lat - o.lat), dn = rad(a.lon - o.lon);
    const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(o.lat)) * Math.cos(rad(a.lat)) * Math.sin(dn / 2) ** 2;
    return 2 * 3440.065 * Math.asin(Math.sqrt(h));
  };
  const list = (d.ac || []).filter((a) => a.lat != null && (o.showGround || a.alt_baro !== 'ground'))
    .map((a) => ({
      callsign: (a.flight || '').trim() || a.hex, type: a.t, reg: a.r, alt: a.alt_baro === 'ground' ? 0 : a.alt_baro,
      speed: a.gs && Math.round(a.gs), heading: a.track && Math.round(a.track), distNm: +dist(a).toFixed(1),
    })).sort((a, b) => a.distNm - b.distNm);
  return { radiusNm: radius, total: list.length, flights: list.slice(0, o.limit || 8) };
}

// ---------- Google Photos shared album (scrapes the public share page; no API key) ----------
async function photos(o) {
  const res = await fetch(o.albumUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`album responded ${res.status}`);
  const html = await res.text();
  const urls = [...new Set(html.match(/https:\/\/lh3\.googleusercontent\.com\/pw\/[\w-]+/g) || [])];
  if (!urls.length) throw new Error('No photos found (is the album shared by link?)');
  return { photos: urls };
}

const handlers = { photos, weather, news, calendar, sports, stocks, flights };
const DEFAULT_TTL = { photos: 3600, weather: 600, news: 600, calendar: 300, sports: 60, stocks: 60, flights: 15 };

async function widgetData(id) {
  const w = (readConfig().widgets || []).find((x) => x.id === id);
  if (!w || !handlers[w.type]) return [404, { error: 'unknown widget' }];
  const hit = cache.get(id);
  const ttl = (w.options?.cacheSeconds ?? DEFAULT_TTL[w.type]) * 1000;
  if (hit && Date.now() - hit.t < ttl) return [200, hit.data];
  try {
    const data = await handlers[w.type](w.options || {});
    cache.set(id, { t: Date.now(), data });
    return [200, data];
  } catch (e) {
    if (hit) return [200, hit.data]; // serve stale on upstream failure
    return [502, { error: e.message }];
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/api/config') return send(res, 200, readConfig());
    const m = url.pathname.match(/^\/api\/widget\/([\w-]+)$/);
    if (m) { const [c, b] = await widgetData(m[1]); return send(res, c, b); }
    const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}).listen(PORT, () => console.log(`Dashboard on http://0.0.0.0:${PORT} (config: ${CONFIG_PATH}${fs.existsSync(LOCAL_PATH) ? ' + ' + LOCAL_PATH : ''})`));
