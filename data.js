/*
 * data.js — data layer for the World Cup Live Stats Center.
 *
 * Exposes a single async function:  window.WCData.fetch()
 * which resolves to a normalized snapshot:
 *   {
 *     updatedAt: <ISO string>,
 *     source: "<label>",
 *     teams:   [ { id, name, code, flag, group } ],
 *     groups:  { A: [ {team, P,W,D,L,GF,GA,Pts} ], ... },
 *     matches: [ { id, group, status, minute, home, away, hScore, aScore, events:[], stats:{} } ],
 *     players: [ { id, name, team, teamCode, flag, position, goals, assists, shots,
 *                  passes, passAcc, tackles, minutes, rating, ... } ],
 *   }
 *
 * Two providers are supported, selected via window.WC_CONFIG.provider:
 *   - "simulator"   : self-contained, advances state on each fetch (default)
 *   - "apiFootball" : pulls live data from api-sports.io and normalizes it
 */
(function () {
  "use strict";

  // ----------------------------------------------------------------------
  //  Teams (a 16-team illustrative bracket; extend freely)
  // ----------------------------------------------------------------------
  const TEAMS = [
    { id: 1,  name: "Argentina",   code: "ARG", flag: "🇦🇷", group: "A" },
    { id: 2,  name: "Mexico",      code: "MEX", flag: "🇲🇽", group: "A" },
    { id: 3,  name: "Croatia",     code: "CRO", flag: "🇭🇷", group: "A" },
    { id: 4,  name: "Morocco",     code: "MAR", flag: "🇲🇦", group: "A" },

    { id: 5,  name: "France",      code: "FRA", flag: "🇫🇷", group: "B" },
    { id: 6,  name: "USA",         code: "USA", flag: "🇺🇸", group: "B" },
    { id: 7,  name: "Japan",       code: "JPN", flag: "🇯🇵", group: "B" },
    { id: 8,  name: "Senegal",     code: "SEN", flag: "🇸🇳", group: "B" },

    { id: 9,  name: "Brazil",      code: "BRA", flag: "🇧🇷", group: "C" },
    { id: 10, name: "Spain",       code: "ESP", flag: "🇪🇸", group: "C" },
    { id: 11, name: "Germany",     code: "GER", flag: "🇩🇪", group: "C" },
    { id: 12, name: "Canada",      code: "CAN", flag: "🇨🇦", group: "C" },

    { id: 13, name: "England",     code: "ENG", flag: "🏴", group: "D" },
    { id: 14, name: "Portugal",    code: "POR", flag: "🇵🇹", group: "D" },
    { id: 15, name: "Netherlands", code: "NED", flag: "🇳🇱", group: "D" },
    { id: 16, name: "South Korea", code: "KOR", flag: "🇰🇷", group: "D" },
  ];

  // Curated stars per team, each with a realistic position (rest of squad is
  // generated). Format: [name, position].
  const STARS = {
    ARG: [["L. Messi", "FW"], ["J. Álvarez", "FW"], ["E. Martínez", "GK"], ["R. De Paul", "MF"]],
    MEX: [["S. Giménez", "FW"], ["H. Lozano", "FW"], ["E. Álvarez", "MF"], ["G. Ochoa", "GK"]],
    CRO: [["L. Modrić", "MF"], ["J. Stanišić", "DF"], ["A. Kramarić", "FW"], ["M. Pašalić", "MF"]],
    MAR: [["A. Hakimi", "DF"], ["Y. En-Nesyri", "FW"], ["H. Ziyech", "MF"], ["S. Amrabat", "MF"]],
    FRA: [["K. Mbappé", "FW"], ["A. Griezmann", "FW"], ["O. Dembélé", "FW"], ["W. Saliba", "DF"]],
    USA: [["C. Pulisic", "FW"], ["W. McKennie", "MF"], ["T. Adams", "MF"], ["Y. Musah", "MF"]],
    JPN: [["T. Kubo", "FW"], ["K. Mitoma", "FW"], ["D. Kamada", "MF"], ["W. Endō", "MF"]],
    SEN: [["S. Mané", "FW"], ["N. Jackson", "FW"], ["É. Mendy", "GK"], ["K. Koulibaly", "DF"]],
    BRA: [["Vinícius Jr.", "FW"], ["Rodrygo", "FW"], ["Raphinha", "FW"], ["Casemiro", "MF"]],
    ESP: [["Lamine Yamal", "FW"], ["Pedri", "MF"], ["Rodri", "MF"], ["Á. Morata", "FW"]],
    GER: [["J. Musiala", "MF"], ["F. Wirtz", "MF"], ["K. Havertz", "FW"], ["J. Kimmich", "MF"]],
    CAN: [["A. Davies", "DF"], ["J. David", "FW"], ["C. Larin", "FW"], ["S. Eustáquio", "MF"]],
    ENG: [["H. Kane", "FW"], ["J. Bellingham", "MF"], ["B. Saka", "FW"], ["P. Foden", "MF"]],
    POR: [["C. Ronaldo", "FW"], ["B. Fernandes", "MF"], ["R. Leão", "FW"], ["B. Silva", "MF"]],
    NED: [["V. van Dijk", "DF"], ["C. Gakpo", "FW"], ["F. de Jong", "MF"], ["M. Depay", "FW"]],
    KOR: [["Son Heung-min", "FW"], ["Lee Kang-in", "MF"], ["Kim Min-jae", "DF"], ["Hwang Hee-chan", "FW"]],
  };

  const POSITIONS = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"];
  const GIVEN = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "I.", "J.", "K.", "L.", "M.", "N.", "O.", "P.", "R.", "S.", "T.", "V."];
  const SURNAMES = ["Silva", "Costa", "Müller", "Smith", "Tanaka", "Diop", "Rossi", "Novak", "Kim", "Hassan", "Lopez", "Bauer", "Ferraro", "Petrov", "Okafor", "Haaland", "Berg", "Yilmaz", "Andersen", "Moreau", "Brandt", "Sato", "Mensah", "Vidal", "Ricci", "Sané"];

  // ----------------------------------------------------------------------
  //  Deterministic-ish RNG so the simulator is stable across reloads
  // ----------------------------------------------------------------------
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ----------------------------------------------------------------------
  //  Build the initial squad for every team
  // ----------------------------------------------------------------------
  function buildPlayers() {
    const players = [];
    let pid = 1;
    TEAMS.forEach((team) => {
      const rng = mulberry32(team.id * 7919);
      const stars = STARS[team.code] || [];
      // Whether any star is a goalkeeper; if not, the first generated starter
      // becomes the keeper so every starting XI has exactly one GK.
      const starHasGK = stars.some((s) => s[1] === "GK");
      const gkFillIndex = stars.length; // first non-star starter slot
      for (let i = 0; i < 16; i++) {
        let name, position;
        if (i < stars.length) {
          name = stars[i][0];
          position = stars[i][1];
        } else {
          name = GIVEN[Math.floor(rng() * GIVEN.length)] + " " +
            SURNAMES[Math.floor(rng() * SURNAMES.length)];
          if (!starHasGK && i === gkFillIndex) {
            position = "GK";
          } else {
            position = POSITIONS[Math.min(i, POSITIONS.length - 1)] ||
              (rng() < 0.5 ? "MF" : "DF");
          }
        }
        const starter = i < 11;
        players.push({
          id: pid++,
          name,
          team: team.name,
          teamCode: team.code,
          flag: team.flag,
          position,
          isStar: i < stars.length,
          starter,
          // accumulators (filled by the simulator over time)
          goals: 0,
          assists: 0,
          shots: 0,
          shotsOnTarget: 0,
          passes: 0,
          passesCompleted: 0,
          tackles: 0,
          fouls: 0,
          yellow: 0,
          red: 0,
          minutes: 0,
          rating: 6.5,
          // per-player scoring propensity
          _attack: position === "FW" ? 0.9 : position === "MF" ? 0.55 : position === "DF" ? 0.18 : 0.03,
        });
      }
    });
    return players;
  }

  // ----------------------------------------------------------------------
  //  Build the match schedule
  // ----------------------------------------------------------------------
  function buildMatches() {
    // Each group plays a small round-robin. We stagger statuses so the
    // dashboard always shows a healthy mix of LIVE / FT / upcoming.
    const matches = [];
    let mid = 1;
    const now = Date.now();

    const byGroup = {};
    TEAMS.forEach((t) => { (byGroup[t.group] = byGroup[t.group] || []).push(t); });

    // status plan per group: [match0, match1, match2]
    const statusPlan = {
      A: ["FT", "LIVE", "NS"],
      B: ["LIVE", "FT", "NS"],
      C: ["FT", "FT", "LIVE"],
      D: ["LIVE", "NS", "NS"],
    };

    Object.keys(byGroup).forEach((g) => {
      const [t0, t1, t2, t3] = byGroup[g];
      const pairings = [
        [t0, t1],
        [t2, t3],
        [t0, t2],
      ];
      pairings.forEach((pair, idx) => {
        const status = (statusPlan[g] && statusPlan[g][idx]) || "NS";
        const rng = mulberry32(mid * 1013);
        let minute = 0, hScore = 0, aScore = 0;
        if (status === "FT") {
          minute = 90;
          hScore = Math.floor(rng() * 4);
          aScore = Math.floor(rng() * 3);
        } else if (status === "LIVE") {
          minute = 15 + Math.floor(rng() * 60);
          hScore = Math.floor(rng() * 3);
          aScore = Math.floor(rng() * 2);
        } else if (status === "HT") {
          minute = 45;
          hScore = Math.floor(rng() * 2);
          aScore = Math.floor(rng() * 2);
        }
        const kickoff = status === "NS"
          ? now + (idx + 1) * 3600 * 1000
          : now - minute * 60 * 1000;
        matches.push({
          id: mid++,
          group: g,
          status,
          minute,
          kickoff,
          home: pair[0],
          away: pair[1],
          hScore,
          aScore,
          events: [],
          stats: freshMatchStats(),
        });
      });
    });
    return matches;
  }

  function freshMatchStats() {
    return {
      possession: [50, 50],
      shots: [0, 0],
      shotsOnTarget: [0, 0],
      corners: [0, 0],
      fouls: [0, 0],
      passes: [0, 0],
    };
  }

  // ----------------------------------------------------------------------
  //  Simulator state (module-level, persists across fetches in a session)
  // ----------------------------------------------------------------------
  const SIM = {
    players: buildPlayers(),
    matches: buildMatches(),
    playerById: null,
    playersByTeam: {},
    lastTick: Date.now(),
    initialized: false,
  };

  function indexPlayers() {
    SIM.playerById = new Map(SIM.players.map((p) => [p.id, p]));
    SIM.playersByTeam = {};
    SIM.players.forEach((p) => {
      (SIM.playersByTeam[p.teamCode] = SIM.playersByTeam[p.teamCode] || []).push(p);
    });
  }

  function pickScorer(teamCode) {
    const squad = (SIM.playersByTeam[teamCode] || []).filter((p) => p.starter);
    if (!squad.length) return null;
    const weights = squad.map((p) => p._attack + 0.01);
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < squad.length; i++) {
      r -= weights[i];
      if (r <= 0) return squad[i];
    }
    return squad[squad.length - 1];
  }

  function pickAssister(teamCode, exceptId) {
    const squad = (SIM.playersByTeam[teamCode] || [])
      .filter((p) => p.starter && p.id !== exceptId && p.position !== "GK");
    if (!squad.length) return null;
    return squad[Math.floor(Math.random() * squad.length)];
  }

  // Advance the world by the elapsed wall-clock time since the last tick.
  function tick() {
    const now = Date.now();
    const elapsedMs = now - SIM.lastTick;
    SIM.lastTick = now;
    // Each real second simulates a few "match seconds"; cap to avoid huge jumps.
    const matchMinutesAdvanced = Math.min(elapsedMs / 1000 * 0.25, 6);

    SIM.matches.forEach((m) => {
      if (m.status === "LIVE" || m.status === "HT") {
        if (m.status === "HT") {
          // brief half-time, then resume
          if (Math.random() < 0.3) m.status = "LIVE";
          return;
        }
        const before = m.minute;
        m.minute = Math.min(90, m.minute + matchMinutesAdvanced);

        // accumulate minutes for on-pitch starters
        const minsAdded = m.minute - before;
        [m.home.code, m.away.code].forEach((code) => {
          (SIM.playersByTeam[code] || []).forEach((p) => {
            if (p.starter) p.minutes = Math.min(90, p.minutes + minsAdded);
          });
        });

        // possession drift
        let drift = (Math.random() - 0.5) * 4;
        m.stats.possession[0] = clamp(Math.round(m.stats.possession[0] + drift), 30, 70);
        m.stats.possession[1] = 100 - m.stats.possession[0];

        // passing volume grows continuously for everyone on the pitch
        [m.home.code, m.away.code].forEach((code, i) => {
          (SIM.playersByTeam[code] || []).forEach((p) => {
            if (!p.starter) return;
            const add = Math.floor(minsAdded * (1 + Math.random() * 2.5));
            p.passes += add;
            p.passesCompleted += Math.round(add * (0.78 + Math.random() * 0.18));
            m.stats.passes[i] += add;
          });
        });

        // chance of one or more events proportional to minutes advanced
        let chances = minsAdded * 0.55;
        while (chances > 0) {
          if (Math.random() < Math.min(chances, 1)) maybeEvent(m);
          chances -= 1;
        }

        if (m.minute >= 90) {
          m.minute = 90;
          m.status = "FT";
          m.events.push({ minute: 90, type: "whistle", text: "Full time" });
        } else if (before < 45 && m.minute >= 45 && Math.random() < 0.5) {
          m.status = "HT";
        }
      }
    });

    recomputeRatings();
  }

  function maybeEvent(m) {
    const attackingHome = Math.random() < m.stats.possession[0] / 100;
    const teamCode = attackingHome ? m.home.code : m.away.code;
    const oppCode = attackingHome ? m.away.code : m.home.code;
    const side = attackingHome ? 0 : 1;
    const minute = Math.round(m.minute);

    const roll = Math.random();
    // a shot happens
    m.stats.shots[side]++;
    const scorer = pickScorer(teamCode);
    if (!scorer) return;
    scorer.shots++;

    if (roll < 0.28) {
      // GOAL
      m.stats.shotsOnTarget[side]++;
      scorer.shotsOnTarget++;
      scorer.goals++;
      if (attackingHome) m.hScore++; else m.aScore++;
      const assister = Math.random() < 0.65 ? pickAssister(teamCode, scorer.id) : null;
      if (assister) assister.assists++;
      m.events.push({
        minute, type: "goal", team: teamCode,
        text: `⚽ GOAL — ${scorer.name} (${teamCode})` + (assister ? `, assist ${assister.name}` : ""),
      });
    } else if (roll < 0.5) {
      // shot on target, saved
      m.stats.shotsOnTarget[side]++;
      scorer.shotsOnTarget++;
    } else if (roll < 0.62) {
      // corner
      m.stats.corners[side]++;
    } else if (roll < 0.78) {
      // foul / card by a defender on the other team
      m.stats.fouls[1 - side]++;
      const fouler = pickAssister(oppCode, -1);
      if (fouler) {
        fouler.fouls++;
        if (Math.random() < 0.22) {
          fouler.yellow++;
          m.events.push({ minute, type: "yellow", team: oppCode, text: `🟨 Yellow — ${fouler.name} (${oppCode})` });
        }
      }
    } else {
      // a tackle / defensive action
      const defender = pickAssister(oppCode, -1);
      if (defender) defender.tackles++;
    }
  }

  function recomputeRatings() {
    SIM.players.forEach((p) => {
      let r = 6.0;
      r += p.goals * 1.1;
      r += p.assists * 0.7;
      r += p.shotsOnTarget * 0.08;
      r += p.tackles * 0.05;
      r += (p.minutes / 90) * 0.4;
      r -= p.yellow * 0.2;
      r -= p.red * 1.0;
      const acc = p.passes ? p.passesCompleted / p.passes : 0.8;
      r += (acc - 0.8) * 1.5;
      p.rating = clamp(Math.round(r * 10) / 10, 4.0, 10.0);
    });
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // Seed a bit of pre-match history so finished games already have stats.
  function seedHistory() {
    if (SIM.initialized) return;
    indexPlayers();
    SIM.matches.forEach((m) => {
      if (m.status === "FT" || m.status === "LIVE" || m.status === "HT") {
        // distribute the existing scoreline to scorers
        for (let i = 0; i < m.hScore; i++) creditGoal(m, m.home.code, m.away.code, true);
        for (let i = 0; i < m.aScore; i++) creditGoal(m, m.away.code, m.home.code, false);
        // give everyone who played some baseline minutes/passes
        const mins = m.status === "FT" ? 90 : m.minute;
        [m.home.code, m.away.code].forEach((code, idx) => {
          (SIM.playersByTeam[code] || []).forEach((p) => {
            if (!p.starter) return;
            p.minutes = Math.max(p.minutes, mins);
            const vol = Math.floor(20 + Math.random() * 50 * (mins / 90));
            p.passes += vol;
            p.passesCompleted += Math.round(vol * (0.78 + Math.random() * 0.18));
            p.shots += Math.floor(Math.random() * 3 * p._attack);
            p.tackles += Math.floor(Math.random() * 3);
            m.stats.passes[idx] += vol;
            m.stats.shots[idx] += Math.floor(Math.random() * 4);
          });
        });
        m.stats.possession[0] = 40 + Math.floor(Math.random() * 20);
        m.stats.possession[1] = 100 - m.stats.possession[0];
      }
    });
    recomputeRatings();
    SIM.initialized = true;
  }

  function creditGoal(m, teamCode, oppCode, isHome) {
    const scorer = pickScorer(teamCode);
    if (!scorer) return;
    scorer.goals++;
    scorer.shots++;
    scorer.shotsOnTarget++;
    const assister = Math.random() < 0.6 ? pickAssister(teamCode, scorer.id) : null;
    if (assister) assister.assists++;
    const minute = Math.max(1, Math.round(Math.random() * (m.minute || 90)));
    m.events.push({
      minute, type: "goal", team: teamCode,
      text: `⚽ GOAL — ${scorer.name} (${teamCode})` + (assister ? `, assist ${assister.name}` : ""),
    });
    m.events.sort((a, b) => a.minute - b.minute);
  }

  // ----------------------------------------------------------------------
  //  Standings derived from matches
  // ----------------------------------------------------------------------
  function buildStandings(matches) {
    const groups = {};
    TEAMS.forEach((t) => {
      groups[t.group] = groups[t.group] || [];
      groups[t.group].push({
        team: t, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0,
      });
    });
    const row = (g, code) => groups[g].find((r) => r.team.code === code);

    matches.forEach((m) => {
      if (m.status === "NS") return;
      const h = row(m.group, m.home.code);
      const a = row(m.group, m.away.code);
      if (!h || !a) return;
      // only count finished games toward W/D/L; live games count GF/GA tentatively
      h.GF += m.hScore; h.GA += m.aScore;
      a.GF += m.aScore; a.GA += m.hScore;
      if (m.status === "FT") {
        h.P++; a.P++;
        if (m.hScore > m.aScore) { h.W++; a.L++; h.Pts += 3; }
        else if (m.hScore < m.aScore) { a.W++; h.L++; a.Pts += 3; }
        else { h.D++; a.D++; h.Pts++; a.Pts++; }
      }
    });

    Object.keys(groups).forEach((g) => {
      groups[g].sort((x, y) =>
        y.Pts - x.Pts || (y.GF - y.GA) - (x.GF - x.GA) || y.GF - x.GF);
    });
    return groups;
  }

  // ----------------------------------------------------------------------
  //  Public snapshot builder
  // ----------------------------------------------------------------------
  function snapshot(sourceLabel) {
    const players = SIM.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      teamCode: p.teamCode,
      flag: p.flag,
      position: p.position,
      isStar: p.isStar,
      goals: p.goals,
      assists: p.assists,
      shots: p.shots,
      shotsOnTarget: p.shotsOnTarget,
      passes: p.passes,
      passAcc: p.passes ? Math.round((p.passesCompleted / p.passes) * 100) : 0,
      tackles: p.tackles,
      fouls: p.fouls,
      yellow: p.yellow,
      red: p.red,
      minutes: Math.round(p.minutes),
      rating: p.rating,
    }));

    const matches = SIM.matches.map((m) => ({
      id: m.id,
      group: m.group,
      status: m.status,
      minute: Math.round(m.minute),
      kickoff: m.kickoff,
      home: { name: m.home.name, code: m.home.code, flag: m.home.flag },
      away: { name: m.away.name, code: m.away.code, flag: m.away.flag },
      hScore: m.hScore,
      aScore: m.aScore,
      events: m.events.slice(-12),
      stats: m.stats,
    }));

    return {
      updatedAt: new Date().toISOString(),
      source: sourceLabel,
      teams: TEAMS,
      groups: buildStandings(SIM.matches),
      matches,
      players,
    };
  }

  // ----------------------------------------------------------------------
  //  Providers
  // ----------------------------------------------------------------------
  async function fetchSimulator() {
    seedHistory();
    tick();
    return snapshot("built-in live simulator");
  }

  // Minimal API-Football adapter. Maps the provider's responses into our
  // normalized shape. Network/CORS may require a backend proxy in production.
  async function fetchApiFootball() {
    const cfg = window.WC_CONFIG.apiFootball;
    const headers = { "x-apisports-key": cfg.apiKey };
    const q = `league=${cfg.leagueId}&season=${cfg.season}`;

    const fixturesRes = await fetch(`${cfg.baseUrl}/fixtures?${q}`, { headers });
    const fixturesJson = await fixturesRes.json();
    const fixtures = fixturesJson.response || [];

    const matches = fixtures.map((f) => {
      const st = f.fixture.status.short; // NS, 1H, HT, 2H, FT...
      const status = ({ "1H": "LIVE", "2H": "LIVE", ET: "LIVE", P: "LIVE", HT: "HT", FT: "FT", AET: "FT", PEN: "FT", NS: "NS" })[st] || st;
      return {
        id: f.fixture.id,
        group: (f.league.round || "").replace(/Group\s*/i, "").trim().charAt(0) || "—",
        status,
        minute: f.fixture.status.elapsed || 0,
        kickoff: new Date(f.fixture.date).getTime(),
        home: { name: f.teams.home.name, code: f.teams.home.name.slice(0, 3).toUpperCase(), flag: "🏳️" },
        away: { name: f.teams.away.name, code: f.teams.away.name.slice(0, 3).toUpperCase(), flag: "🏳️" },
        hScore: f.goals.home ?? 0,
        aScore: f.goals.away ?? 0,
        events: [],
        stats: freshMatchStats(),
      };
    });

    // Player stats endpoint is paginated per team; left as an extension point.
    // We surface whatever the topscorers endpoint provides as a starting set.
    let players = [];
    try {
      const tsRes = await fetch(`${cfg.baseUrl}/players/topscorers?${q}`, { headers });
      const tsJson = await tsRes.json();
      players = (tsJson.response || []).map((row, i) => {
        const s = (row.statistics && row.statistics[0]) || {};
        return {
          id: row.player.id || i,
          name: row.player.name,
          team: s.team ? s.team.name : "",
          teamCode: (s.team ? s.team.name : "").slice(0, 3).toUpperCase(),
          flag: "🏳️",
          position: (s.games && s.games.position) || "—",
          goals: (s.goals && s.goals.total) || 0,
          assists: (s.goals && s.goals.assists) || 0,
          shots: (s.shots && s.shots.total) || 0,
          shotsOnTarget: (s.shots && s.shots.on) || 0,
          passes: (s.passes && s.passes.total) || 0,
          passAcc: (s.passes && parseInt(s.passes.accuracy)) || 0,
          tackles: (s.tackles && s.tackles.total) || 0,
          fouls: (s.fouls && s.fouls.committed) || 0,
          yellow: (s.cards && s.cards.yellow) || 0,
          red: (s.cards && s.cards.red) || 0,
          minutes: (s.games && s.games.minutes) || 0,
          rating: parseFloat((s.games && s.games.rating) || 0) || 0,
        };
      });
    } catch (e) {
      console.warn("topscorers fetch failed", e);
    }

    // Build a simple standings table from the matches we have.
    const groups = buildStandingsFromMatches(matches);

    return {
      updatedAt: new Date().toISOString(),
      source: "API-Football (api-sports.io)",
      teams: [],
      groups,
      matches,
      players,
    };
  }

  function buildStandingsFromMatches(matches) {
    const groups = {};
    const ensure = (g, name) => {
      groups[g] = groups[g] || [];
      let r = groups[g].find((x) => x.team.name === name);
      if (!r) { r = { team: { name, code: name.slice(0, 3).toUpperCase(), flag: "🏳️", group: g }, P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0, Pts: 0 }; groups[g].push(r); }
      return r;
    };
    matches.forEach((m) => {
      if (m.status === "NS") return;
      const h = ensure(m.group, m.home.name);
      const a = ensure(m.group, m.away.name);
      h.GF += m.hScore; h.GA += m.aScore; a.GF += m.aScore; a.GA += m.hScore;
      if (m.status === "FT") {
        h.P++; a.P++;
        if (m.hScore > m.aScore) { h.W++; a.L++; h.Pts += 3; }
        else if (m.hScore < m.aScore) { a.W++; h.L++; a.Pts += 3; }
        else { h.D++; a.D++; h.Pts++; a.Pts++; }
      }
    });
    Object.keys(groups).forEach((g) =>
      groups[g].sort((x, y) => y.Pts - x.Pts || (y.GF - y.GA) - (x.GF - x.GA) || y.GF - x.GF));
    return groups;
  }

  // ----------------------------------------------------------------------
  //  Public API
  // ----------------------------------------------------------------------
  window.WCData = {
    async fetch() {
      const provider = (window.WC_CONFIG && window.WC_CONFIG.provider) || "simulator";
      if (provider === "apiFootball" && window.WC_CONFIG.apiFootball.apiKey) {
        try {
          return await fetchApiFootball();
        } catch (e) {
          console.error("apiFootball failed, falling back to simulator:", e);
          return fetchSimulator();
        }
      }
      return fetchSimulator();
    },
  };
})();
