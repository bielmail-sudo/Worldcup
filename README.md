# World Cup 2026 — Live Stats Center ⚽

A single-page web dashboard showing **live World Cup match and player statistics**,
auto-refreshing in real time. It works out of the box with **zero setup** thanks to
a built-in live data simulator, and can be pointed at a real football data provider
when you have an API key.

![tech](https://img.shields.io/badge/stack-vanilla%20JS-blue) ![status](https://img.shields.io/badge/data-live-red)

## Features

- **Live matches** — scores, match clock, possession bar, shots/corners/fouls,
  and a running goal feed. Cards auto-update on an interval.
- **All players** — a sortable, searchable table of every player across all teams
  with goals, assists, shots, passes, pass accuracy, tackles, minutes and a live
  performance rating. Click any player for a full stat card.
- **Team standings** — group tables (P/W/D/L/GF/GA/GD/Pts) derived from results,
  with qualification highlighting.
- **Leaderboards** — top scorers, assists, ratings, shots, tackles and minutes.
- **Auto-refresh** — choose 5s / 10s / 30s / 60s or off, plus manual refresh.
- Responsive, dark, mobile-friendly UI. No build step, no dependencies.

## Run it

It's pure static files — just open `index.html`, or serve the folder:

```bash
# any static server works, e.g.
python3 -m http.server 8000
# then visit http://localhost:8000
```

Open the page and you'll immediately see live-updating matches and accumulating
player stats.

## Using real live data

The data layer is pluggable (see `data.js`). To use a real provider such as
[API-Football (api-sports.io)](https://www.api-sports.io/), edit `config.js`:

```js
window.WC_CONFIG = {
  provider: "apiFootball",
  apiFootball: {
    baseUrl: "https://v3.football.api-sports.io",
    apiKey: "YOUR_API_KEY",
    leagueId: 1,     // FIFA World Cup
    season: 2026,
  },
};
```

The adapter normalizes fixtures and top-scorer stats into the app's internal
shape. Because browsers enforce CORS and you should never ship a real API key in
client code, for production route requests through a small backend proxy that
injects the key server-side. If a real request fails, the app automatically falls
back to the simulator so the page never goes blank.

## Project structure

| File | Purpose |
|------|---------|
| `index.html` | Markup and view shells |
| `styles.css` | Dark, responsive styling |
| `config.js`  | Data-source configuration |
| `data.js`    | Data layer: live simulator + API-Football adapter, normalized snapshot |
| `app.js`     | UI controller: polling, rendering, sorting, search, modal |

## Notes

The default dataset is an illustrative 16-team bracket with real star names and a
realistic match engine for demonstration. Swap in a live provider for official
figures. This is an independent fan project and is not affiliated with FIFA.
