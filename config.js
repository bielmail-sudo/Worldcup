/*
 * Data source configuration.
 * ---------------------------
 * Out of the box this site runs on a built-in LIVE SIMULATOR so you can see
 * real-time updating stats without any API key.
 *
 * To plug in a real provider (e.g. API-Football / api-sports.io), set:
 *   provider:  "apiFootball"
 *   apiKey:    "<your key>"
 *   season / leagueId as appropriate.
 *
 * NOTE: never commit a real production key to a public repo. Prefer serving
 * config.js with an injected value, or proxy requests through a backend.
 */
window.WC_CONFIG = {
  // "simulator" | "apiFootball"
  provider: "simulator",

  // --- API-Football settings (only used when provider === "apiFootball") ---
  apiFootball: {
    baseUrl: "https://v3.football.api-sports.io",
    apiKey: "",          // <-- put your api-sports.io key here
    leagueId: 1,         // 1 = FIFA World Cup
    season: 2026,
  },

  // How long (ms) a match stays "stale" before the UI flags the feed as down.
  staleAfterMs: 120000,
};
