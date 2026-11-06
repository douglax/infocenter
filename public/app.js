(() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtTime = (d, o = {}) => d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', ...o });
  const WX = { 0: ['☀️', 'Clear'], 1: ['🌤️', 'Mostly clear'], 2: ['⛅', 'Partly cloudy'], 3: ['☁️', 'Overcast'], 45: ['🌫️', 'Fog'], 48: ['🌫️', 'Rime fog'],
    51: ['🌦️', 'Drizzle'], 53: ['🌦️', 'Drizzle'], 55: ['🌦️', 'Drizzle'], 61: ['🌧️', 'Rain'], 63: ['🌧️', 'Rain'], 65: ['🌧️', 'Heavy rain'],
    66: ['🌧️', 'Freezing rain'], 67: ['🌧️', 'Freezing rain'], 71: ['🌨️', 'Snow'], 73: ['🌨️', 'Snow'], 75: ['❄️', 'Heavy snow'], 77: ['🌨️', 'Snow grains'],
    80: ['🌦️', 'Showers'], 81: ['🌧️', 'Showers'], 82: ['⛈️', 'Violent showers'], 85: ['🌨️', 'Snow showers'], 86: ['🌨️', 'Snow showers'],
    95: ['⛈️', 'Thunderstorm'], 96: ['⛈️', 'Thunderstorm, hail'], 99: ['⛈️', 'Thunderstorm, hail'] };
  const wx = (c) => WX[c] || ['❓', ''];

  const renderers = {
    clock: {
      local: true,
      render(el, _d, o) {
        const n = new Date();
        el.innerHTML = `<div class="time">${fmtTime(n, { hour12: o.hour12 !== false, second: o.showSeconds ? '2-digit' : undefined })}</div>
          <div class="date">${n.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>`;
      },
      tick: 1000,
    },
    weather: {
      title: (o) => `Weather${o.name ? ' · ' + esc(o.name) : ''}`,
      render(el, d) {
        const c = d.current, deg = d.units === 'metric' ? '°C' : '°F', spd = d.units === 'metric' ? 'km/h' : 'mph';
        const [icon, text] = wx(c.weather_code);
        el.innerHTML = `<div class="wx-now"><div class="wx-icon">${icon}</div>
          <div><div class="wx-temp">${Math.round(c.temperature_2m)}${deg}</div><div class="muted">${text} · feels ${Math.round(c.apparent_temperature)}°</div></div></div>
          <div class="muted" style="margin-top:6px">💧 ${c.relative_humidity_2m}% &nbsp; 💨 ${Math.round(c.wind_speed_10m)} ${spd}</div>
          <div class="wx-days">${d.daily.time.slice(1, 6).map((t, i) => `<div><div class="muted">${new Date(t + 'T12:00').toLocaleDateString([], { weekday: 'short' })}</div>
            <div class="ic">${wx(d.daily.weather_code[i + 1])[0]}</div>
            <div>${Math.round(d.daily.temperature_2m_max[i + 1])}° <span class="muted">${Math.round(d.daily.temperature_2m_min[i + 1])}°</span></div>
            <div class="muted">${d.daily.precipitation_probability_max[i + 1] ?? 0}%</div></div>`).join('')}</div>`;
      },
    },
    calendar: {
      title: () => 'Upcoming',
      render(el, d) {
        if (!d.events.length) { el.innerHTML = '<div class="muted">Nothing scheduled</div>'; return; }
        let last = '';
        el.innerHTML = d.events.map((e) => {
          const s = new Date(e.start), day = s.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
          const head = day !== last ? `<div class="ev-day">${day === new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' }) ? 'Today' : day}</div>` : '';
          last = day;
          return `${head}<div class="row"><div class="ev-bar" style="background:${esc(e.color || '')}"></div>
            <div class="grow"><div class="ell">${esc(e.title)}</div>${e.location ? `<div class="muted ell" style="font-size:.8em">${esc(e.location)}</div>` : ''}</div>
            <div class="muted">${e.allDay ? 'All day' : fmtTime(s)}</div></div>`;
        }).join('');
      },
    },
    news: {
      title: () => 'News',
      render(el, d, o) {
        if (o.layout === 'slides') {
          const items = d.items;
          el.innerHTML = '<div class="slides"></div>';
          const box = el.firstChild;
          let i = 0, cur = null;
          const show = () => {
            const n = items[i++ % items.length];
            const s = document.createElement('div');
            s.className = 'slide';
            s.innerHTML = `${n.image ? `<img src="${esc(n.image)}" alt="">` : ''}<div class="cap"><div class="s">${esc(n.source)}${n.time ? ' · ' + ago(new Date(n.time)) : ''}</div>
              <div class="t">${esc(n.title)}</div>${n.summary ? `<div class="sum">${esc(n.summary)}</div>` : ''}</div>`;
            box.appendChild(s);
            requestAnimationFrame(() => s.classList.add('on'));
            const old = cur; cur = s;
            if (old) { old.classList.remove('on'); setTimeout(() => old.remove(), 1500); }
          };
          clearInterval(el._t);
          show();
          if (items.length > 1) el._t = setInterval(show, (o.intervalSeconds || 60) * 1000);
          return;
        }
        el.innerHTML = d.items.map((i) => `<div class="news-item"><div class="t">${esc(i.title)}</div>
          <div class="s">${esc(i.source)}${i.time ? ' · ' + ago(new Date(i.time)) : ''}</div></div>`).join('');
      },
    },
    photos: {
      bare: true,
      render(el, d, o) {
        const list = o.shuffle === false ? d.photos.slice() : d.photos.slice().sort(() => Math.random() - 0.5);
        el.innerHTML = '<img class="ph"><img class="ph">';
        const [a, b] = el.querySelectorAll('img');
        const size = `=w${Math.min(2560, Math.round(el.clientWidth * (devicePixelRatio || 1)))}-h${Math.min(2560, Math.round(el.clientHeight * (devicePixelRatio || 1)))}`;
        a.style.objectFit = b.style.objectFit = o.fit === 'contain' ? 'contain' : 'cover';
        let i = 0, front = a;
        const show = () => {
          const back = front === a ? b : a, img = new Image();
          img.referrerPolicy = 'no-referrer';
          img.onload = () => { back.src = img.src; back.classList.add('on'); front.classList.remove('on'); front = back; };
          img.onerror = () => setTimeout(show, 1000);
          img.src = list[i++ % list.length] + size;
        };
        clearInterval(el._t);
        show();
        el._t = setInterval(show, (o.intervalSeconds || 15) * 1000);
      },
    },
    embed: {
      bare: true,
      local: true,
      tick: 0,
      render(el, _d, o) {
        el.innerHTML = `<iframe class="emb${o.dark ? ' dark' : ''}" src="${esc(o.url)}" title="${esc(o.title || 'Embed')}" frameborder="0" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
      },
    },
    sports: {
      title: () => 'Scores',
      render(el, d, o) {
        if (!d.games.length) { el.innerHTML = '<div class="muted">No games</div>'; return; }
        if (o.layout === 'ticker') {
          const item = (g) => {
            const s = (t) => `${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}${esc(t.abbr)} <b class="${t.winner ? 'w' : ''}">${g.state === 'pre' ? '' : esc(t.score)}</b>`;
            const when = g.state === 'pre' ? new Date(g.date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : g.status;
            return `<span class="tk"><span class="muted">${esc(g.league)}</span> ${s(g.away)} <span class="muted">@</span> ${s(g.home)} <span class="${g.state === 'in' ? 'live' : 'muted'}">${esc(when)}</span></span>`;
          };
          const html = d.games.map(item).join('');
          el.innerHTML = `<div class="tk-track" style="animation-duration:${Math.max(20, d.games.length * (o.secondsPerGame || 6))}s">${html}${html}</div>`;
          return;
        }
        el.innerHTML = d.games.map((g) => {
          const row = (t) => `<div class="${t.winner ? 'w' : ''}">${t.logo ? `<img src="${esc(t.logo)}" alt="">` : ''}${esc(t.name)}</div>
            <div class="${t.winner ? 'w' : ''}">${g.state === 'pre' ? '' : esc(t.score)}</div>`;
          const when = g.state === 'pre' ? new Date(g.date).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : g.status;
          return `<div class="game"><div class="teams">${row(g.away)}${row(g.home)}</div>
            <div class="st ${g.state === 'in' ? 'live' : ''}">${esc(g.league)} · ${esc(when)}</div></div>`;
        }).join('');
      },
    },
    stocks: {
      title: () => 'Markets',
      render(el, d) {
        el.innerHTML = d.items.map((i) => `<div class="row"><div class="grow ell"><b>${esc(i.symbol)}</b></div>
          <div>${i.price.toLocaleString([], { maximumFractionDigits: 2 })}</div>
          <div class="${i.change >= 0 ? 'up' : 'down'}" style="min-width:5em;text-align:right">${i.change >= 0 ? '▲' : '▼'} ${Math.abs(i.pct).toFixed(2)}%</div></div>`).join('');
      },
    },
    flights: {
      title: (o) => `✈ Overhead · ${o.radiusNm || 25} nm`,
      render(el, d) {
        if (!d.flights.length) { el.innerHTML = '<div class="muted">No aircraft nearby</div>'; return; }
        el.innerHTML = d.flights.map((f) => `<div class="row fl"><div class="grow"><div class="cs">${esc(f.callsign)}</div>
          <div class="muted ell" style="font-size:.8em">${esc(f.type || f.reg || '')}</div></div>
          <div class="d">${f.alt != null ? Number(f.alt).toLocaleString() + ' ft' : ''}<div class="muted" style="font-size:.8em">${f.distNm} nm${f.speed ? ' · ' + f.speed + ' kt' : ''}</div></div></div>`).join('');
      },
    },
  };

  function ago(d) {
    const m = Math.round((Date.now() - d) / 60000);
    return m < 1 ? 'now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
  }

  async function start() {
    const cfg = await (await fetch('/api/config')).json();
    const root = document.documentElement.style;
    const th = cfg.theme || {}, g = cfg.grid || { columns: 12, rows: 8, gap: 14 };
    if (th.accent) root.setProperty('--accent', th.accent);
    if (th.background) root.setProperty('--bg', th.background);
    root.setProperty('--scale', th.scale || 1);
    root.setProperty('--gap', `${g.gap ?? 14}px`);
    document.title = cfg.title || 'Dashboard';
    const grid = document.getElementById('grid');
    grid.style.gridTemplateColumns = `repeat(${g.columns}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${g.rows}, minmax(0, 1fr))${cfg.widgets.some((w) => w.options?.layout === 'ticker') ? ' auto' : ''}`;

    for (const w of cfg.widgets) {
      const r = renderers[w.type];
      if (!r) continue;
      const o = w.options || {};
      const el = document.createElement('section');
      el.className = `widget ${w.type}${o.layout === 'ticker' ? ' ticker' : ''}`;
      if (r.bare || o.layout === 'ticker' || o.layout === 'slides') el.style.padding = 0;
      el.style.gridColumn = `${w.col} / span ${w.w || 1}`;
      el.style.gridRow = `${w.row} / span ${w.h || 1}`;
      el.innerHTML = `${r.title && !r.bare && o.layout !== 'ticker' && o.layout !== 'slides' ? `<h2>${r.title(o)}</h2>` : ''}<div class="body"></div>`;
      grid.appendChild(el);
      const body = el.querySelector('.body');
      if (r.local) {
        const go = () => r.render(body, null, o);
        go(); if (r.tick !== 0) setInterval(go, r.tick || 1000);
        continue;
      }
      const load = async () => {
        try {
          const res = await fetch(`/api/widget/${w.id}`);
          const d = await res.json();
          if (!res.ok) throw new Error(d.error);
          r.render(body, d, o);
        } catch (e) {
          if (!body.children.length) body.innerHTML = `<div class="err">${esc(e.message)}</div>`;
        }
      };
      load(); setInterval(load, (w.refresh || 300) * 1000);
    }
    // pick up config edits without touching the Pi
    setTimeout(() => location.reload(), (cfg.reloadMinutes || 360) * 60000);
  }
  start();
})();
