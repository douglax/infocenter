# Infocenter

A self-hosted, always-on wall dashboard (a DAKboard replacement) built from configurable widgets. It has no build step and no runtime dependencies beyond Node.js, and it runs well in a Docker container on a Raspberry Pi driving a kiosk browser.

## Widgets

| Type | Shows | Data source |
|------|-------|-------------|
| `clock` | Time and date | Browser |
| `weather` | Current conditions + 5-day forecast | [Open-Meteo](https://open-meteo.com) (no key) |
| `news` | RSS/Atom feeds as a list, or one story at a time with its photo (`"layout": "slides"`) | Any feed |
| `photos` | Rotating slideshow of a Google Photos shared album | Public share link |
| `sports` | Scores, as a list or an auto-scrolling bottom ticker (`"layout": "ticker"`) | ESPN public scoreboard |
| `calendar` | Agenda from `.ics` feeds (recurring events supported) | Any iCal URL |
| `stocks` | Stock/crypto quotes | Yahoo Finance (no key) |
| `flights` | Aircraft near a point | [adsb.lol](https://adsb.lol) (no key) |
| `embed` | Any embeddable web page in an iframe (flight maps, Google Calendar, ...) | Any URL that allows framing |

The server fetches and caches data, so the browser never calls the upstream APIs directly. If an upstream fails, the last good data stays on screen.

## Run

Requires Docker with Compose (or Node.js 18+ to run without Docker).

```bash
cp config.local.example.json config.local.json   # then edit it, see Configuration
docker compose up -d --build
```

Open `http://<host>:8080`. Set `TZ` in `docker-compose.yml` (and the `Dockerfile`) to your timezone.

Without Docker:

```bash
node server.js          # PORT=8080 by default
```

### Kiosk mode on a Raspberry Pi

```bash
chromium --kiosk --noerrdialogs --disable-infobars http://localhost:8080
```

Add that command to your desktop session's autostart. The page reloads itself every 6 hours (`reloadMinutes`) to pick up config changes.

## Configuration

Configuration is split in two so that personal data never lands in Git:

- `config.json` is **tracked** and holds the layout, theme and generic widget defaults.
- `config.local.json` is **not tracked** (see `.gitignore`/`.dockerignore`) and holds anything personal: your location, calendar, photo album, feeds, teams.

At startup and on each request, `config.local.json` is merged over `config.json`. `config.local.example.json` shows the expected shape.

In the local file, `widgets` is an object keyed by widget `id`. Objects are deep-merged into the matching widget, and arrays (such as `feeds` or `leagues`) replace the base value.

```json
{
  "widgets": {
    "weather": { "options": { "name": "Home", "lat": 40.71, "lon": -74.0, "units": "metric" } },
    "photos":  { "options": { "albumUrl": "https://photos.app.goo.gl/XXXX" } }
  }
}
```

Config changes are read on each request; reload the page (or wait for the auto-reload) to apply them. With Docker, no rebuild is needed because both files are mounted read-only.

### Layout and theme (`config.json`)

- `grid`: `columns`, `rows` and `gap` (px). Widgets are placed with 1-based `col`, `row` and span `w`, `h`. If any widget uses the ticker layout, an extra auto-height row is added below the grid, so place the ticker at `row = rows + 1`.
- `theme`: `accent`, `background`, `scale` (scales all text).
- Per widget: `id` (unique), `type`, position, `refresh` (seconds between browser refreshes) and `options`. Server-side cache time can be overridden with `options.cacheSeconds`.

### Widget options

- **weather**: `name`, `lat`, `lon`, `units` (`metric` | `imperial`).
- **news**: `feeds` (`[{ "name", "url" }]`), `limit`, `layout` (`list` | `slides`), `intervalSeconds` (slide rotation, default 60).
- **photos**: `albumUrl` (a "share by link" album), `intervalSeconds`, `shuffle`, `fit` (`cover` | `contain`). The album must stay shared by link. Google offers no open API for this, so the server reads the public share page, which could break if Google changes it.
- **sports**: `leagues` (`[{ "league": "football/nfl", "teams": ["DAL"] }]`; league paths follow ESPN, e.g. `basketball/nba`, `soccer/mex.1`; `teams` are ESPN abbreviations and optional), `limit`, `layout` (`list` | `ticker`), `secondsPerGame` (ticker speed).
- **calendar**: `calendars` (`[{ "name", "url", "color" }]` of iCal feed URLs, such as the "secret address in iCal format" in Google Calendar), `days`, `limit`.
- **stocks**: `symbols` (Yahoo symbols such as `AAPL`, `^GSPC`, `BTC-USD`).
- **flights**: `lat`, `lon`, `radiusNm`, `limit`, `showGround`.
- **embed**: `url`, `title`, `dark` (inverts colors for light embeds). The target site must allow framing; sites that send `X-Frame-Options: DENY/SAMEORIGIN` will appear blank. Google Calendar's embed only works if the calendar is public, or the browser is signed in to a Google account that can see it. For a private calendar, use the `calendar` widget with the iCal feed instead.

## Notes on privacy

- Keep personal values in `config.local.json` only. It is excluded from Git and from the Docker image build context, and is mounted into the container at runtime.
- The merged configuration is served to the browser at `/api/config`, so anything in it is visible to anyone who can reach the dashboard. Do not expose the port to the internet.
- The Yahoo Finance and ESPN endpoints are unofficial and may change.

## Project layout

```
server.js                      # static server, config merge, widget data proxies + cache
public/                        # index.html, app.js (widget renderers), style.css
config.json                    # tracked layout and defaults
config.local.example.json      # template for your untracked config.local.json
Dockerfile, docker-compose.yml
```
