/*
 * app.js — UI controller. Polls WCData on an interval and renders the views.
 */
(function () {
  "use strict";

  const els = {
    liveDot: document.getElementById("liveDot"),
    liveLabel: document.getElementById("liveLabel"),
    lastUpdated: document.getElementById("lastUpdated"),
    refreshInterval: document.getElementById("refreshInterval"),
    refreshNow: document.getElementById("refreshNow"),
    sourceLabel: document.getElementById("sourceLabel"),
    matchesGrid: document.getElementById("matchesGrid"),
    matchFilters: document.getElementById("matchFilters"),
    playersBody: document.getElementById("playersBody"),
    playersTable: document.getElementById("playersTable"),
    playerSearch: document.getElementById("playerSearch"),
    groupsWrap: document.getElementById("groupsWrap"),
    leadersGrid: document.getElementById("leadersGrid"),
    tabs: document.getElementById("tabs"),
    modal: document.getElementById("playerModal"),
    modalContent: document.getElementById("modalContent"),
    modalClose: document.getElementById("modalClose"),
  };

  const state = {
    snapshot: null,
    timer: null,
    intervalMs: 10000,
    activeView: "matches",
    matchFilter: "all",
    playerSort: { key: "goals", dir: -1 },
    playerQuery: "",
    fetching: false,
  };

  const STATUS_LABEL = { LIVE: "LIVE", HT: "HT", FT: "FT", NS: "Upcoming" };

  // ---------------- polling ----------------
  async function load() {
    if (state.fetching) return;
    state.fetching = true;
    setFeed("updating…", true);
    try {
      const snap = await window.WCData.fetch();
      state.snapshot = snap;
      els.sourceLabel.textContent = snap.source;
      render();
      const t = new Date(snap.updatedAt);
      setFeed("updated " + t.toLocaleTimeString(), liveCount() > 0);
    } catch (e) {
      console.error(e);
      setFeed("feed error", false);
    } finally {
      state.fetching = false;
    }
  }

  function liveCount() {
    if (!state.snapshot) return 0;
    return state.snapshot.matches.filter((m) => m.status === "LIVE" || m.status === "HT").length;
  }

  function setFeed(text, live) {
    els.lastUpdated.textContent = text;
    els.liveDot.classList.toggle("on", !!live);
    els.liveLabel.textContent = live ? "LIVE" : "IDLE";
    els.liveLabel.classList.toggle("off", !live);
  }

  function schedule() {
    if (state.timer) clearInterval(state.timer);
    if (state.intervalMs > 0) {
      state.timer = setInterval(load, state.intervalMs);
    }
  }

  // ---------------- rendering ----------------
  function render() {
    if (!state.snapshot) return;
    if (state.activeView === "matches") renderMatches();
    if (state.activeView === "players") renderPlayers();
    if (state.activeView === "teams") renderTeams();
    if (state.activeView === "leaders") renderLeaders();
  }

  function renderMatches() {
    const matches = state.snapshot.matches.filter((m) =>
      state.matchFilter === "all" ? true : m.status === state.matchFilter);

    // order: live first, then HT, then FT, then upcoming
    const rank = { LIVE: 0, HT: 1, FT: 2, NS: 3 };
    matches.sort((a, b) => (rank[a.status] - rank[b.status]) || a.group.localeCompare(b.group));

    if (!matches.length) {
      els.matchesGrid.innerHTML = `<p class="empty">No matches for this filter.</p>`;
      return;
    }

    els.matchesGrid.innerHTML = matches.map(matchCard).join("");
  }

  function matchCard(m) {
    const isLive = m.status === "LIVE" || m.status === "HT";
    const statusBadge = isLive
      ? `<span class="badge live">${m.status === "HT" ? "HT" : m.minute + "'"}</span>`
      : `<span class="badge ${m.status.toLowerCase()}">${STATUS_LABEL[m.status]}</span>`;

    const kickoff = m.status === "NS"
      ? `<div class="kickoff">${new Date(m.kickoff).toLocaleString([], { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" })}</div>`
      : "";

    const events = (m.events || []).filter((e) => e.type === "goal").slice(-4)
      .map((e) => `<li>${e.minute}' ${escapeHtml(e.text.replace("⚽ GOAL — ", ""))}</li>`).join("");

    const poss = m.stats.possession;
    return `
    <article class="match-card ${isLive ? "is-live" : ""}">
      <div class="match-top">
        <span class="group-tag">Group ${m.group}</span>
        ${statusBadge}
      </div>
      <div class="match-teams">
        <div class="team home">
          <span class="flag">${m.home.flag}</span>
          <span class="tname">${m.home.name}</span>
        </div>
        <div class="score">${m.hScore}<span>–</span>${m.aScore}</div>
        <div class="team away">
          <span class="tname">${m.away.name}</span>
          <span class="flag">${m.away.flag}</span>
        </div>
      </div>
      ${kickoff}
      ${events ? `<ul class="goal-list">${events}</ul>` : ""}
      ${m.status !== "NS" ? `
      <div class="poss-bar" title="Possession ${poss[0]}% – ${poss[1]}%">
        <div class="poss-home" style="width:${poss[0]}%"></div>
        <div class="poss-away" style="width:${poss[1]}%"></div>
      </div>
      <div class="mini-stats">
        <span>Shots ${m.stats.shots[0]}–${m.stats.shots[1]}</span>
        <span>On T ${m.stats.shotsOnTarget[0]}–${m.stats.shotsOnTarget[1]}</span>
        <span>Corners ${m.stats.corners[0]}–${m.stats.corners[1]}</span>
        <span>Fouls ${m.stats.fouls[0]}–${m.stats.fouls[1]}</span>
      </div>` : ""}
    </article>`;
  }

  function renderPlayers() {
    let players = state.snapshot.players.slice();
    const q = state.playerQuery.trim().toLowerCase();
    if (q) {
      players = players.filter((p) =>
        p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
    }
    const { key, dir } = state.playerSort;
    players.sort((a, b) => {
      const va = a[key], vb = b[key];
      if (typeof va === "string") return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });

    els.playersBody.innerHTML = players.slice(0, 400).map((p) => `
      <tr data-pid="${p.id}" class="${p.isStar ? "is-star" : ""}">
        <td class="left name-cell">${p.isStar ? "★ " : ""}${escapeHtml(p.name)}</td>
        <td class="left"><span class="flag-sm">${p.flag}</span>${p.teamCode}</td>
        <td>${p.position}</td>
        <td class="num strong">${p.goals}</td>
        <td class="num">${p.assists}</td>
        <td class="num">${p.shots}</td>
        <td class="num">${p.passes}</td>
        <td class="num">${p.passAcc}%</td>
        <td class="num">${p.tackles}</td>
        <td class="num">${p.minutes}</td>
        <td class="num"><span class="rating ${ratingClass(p.rating)}">${p.rating.toFixed(1)}</span></td>
      </tr>`).join("");

    // header sort indicators
    els.playersTable.querySelectorAll("th.sortable").forEach((th) => {
      th.classList.toggle("sorted", th.dataset.sort === key);
      th.classList.toggle("desc", th.dataset.sort === key && dir === -1);
      th.classList.toggle("asc", th.dataset.sort === key && dir === 1);
    });
  }

  function renderTeams() {
    const groups = state.snapshot.groups;
    const keys = Object.keys(groups).sort();
    els.groupsWrap.innerHTML = keys.map((g) => `
      <div class="group-card">
        <h3>Group ${g}</h3>
        <table class="standings">
          <thead>
            <tr><th class="left">Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>
          </thead>
          <tbody>
            ${groups[g].map((r, i) => `
              <tr class="${i < 2 ? "qualify" : ""}">
                <td class="left"><span class="flag-sm">${r.team.flag}</span>${r.team.name}</td>
                <td>${r.P}</td><td>${r.W}</td><td>${r.D}</td><td>${r.L}</td>
                <td>${r.GF}</td><td>${r.GA}</td><td>${r.GF - r.GA}</td>
                <td class="strong">${r.Pts}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`).join("");
  }

  function renderLeaders() {
    const players = state.snapshot.players;
    const board = (title, key, fmt) => {
      const top = players.slice().sort((a, b) => b[key] - a[key]).slice(0, 10);
      return `
      <div class="leader-card">
        <h3>${title}</h3>
        <ol class="leader-list">
          ${top.map((p) => `
            <li data-pid="${p.id}">
              <span class="lead-flag">${p.flag}</span>
              <span class="lead-name">${escapeHtml(p.name)}</span>
              <span class="lead-team">${p.teamCode}</span>
              <span class="lead-val">${fmt ? fmt(p[key]) : p[key]}</span>
            </li>`).join("")}
        </ol>
      </div>`;
    };
    els.leadersGrid.innerHTML = [
      board("Top Scorers", "goals"),
      board("Top Assists", "assists"),
      board("Best Rated", "rating", (v) => v.toFixed(1)),
      board("Most Shots", "shots"),
      board("Most Tackles", "tackles"),
      board("Most Minutes", "minutes", (v) => v + "'"),
    ].join("");
  }

  // ---------------- player modal ----------------
  function openPlayer(pid) {
    const p = state.snapshot.players.find((x) => x.id === pid);
    if (!p) return;
    const stat = (label, val) => `<div class="ms"><span>${label}</span><strong>${val}</strong></div>`;
    els.modalContent.innerHTML = `
      <div class="modal-head">
        <span class="modal-flag">${p.flag}</span>
        <div>
          <h2 id="modalName">${escapeHtml(p.name)}</h2>
          <p>${p.team} · ${p.position} ${p.isStar ? "· ★ Key player" : ""}</p>
        </div>
        <span class="modal-rating ${ratingClass(p.rating)}">${p.rating.toFixed(1)}</span>
      </div>
      <div class="modal-stats">
        ${stat("Goals", p.goals)}
        ${stat("Assists", p.assists)}
        ${stat("Shots", p.shots)}
        ${stat("On target", p.shotsOnTarget)}
        ${stat("Passes", p.passes)}
        ${stat("Pass %", p.passAcc + "%")}
        ${stat("Tackles", p.tackles)}
        ${stat("Fouls", p.fouls)}
        ${stat("Yellow", p.yellow)}
        ${stat("Red", p.red)}
        ${stat("Minutes", p.minutes + "'")}
        ${stat("G+A", p.goals + p.assists)}
      </div>`;
    els.modal.hidden = false;
  }

  function closeModal() { els.modal.hidden = true; }

  // ---------------- helpers ----------------
  function ratingClass(r) { return r >= 8 ? "high" : r >= 7 ? "mid" : r >= 6 ? "low" : "poor"; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---------------- events ----------------
  els.tabs.addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    state.activeView = btn.dataset.view;
    els.tabs.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
    document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
    document.getElementById("view-" + state.activeView).classList.add("active");
    render();
  });

  els.matchFilters.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    state.matchFilter = pill.dataset.status;
    els.matchFilters.querySelectorAll(".pill").forEach((p) => p.classList.toggle("active", p === pill));
    renderMatches();
  });

  els.playersTable.addEventListener("click", (e) => {
    const th = e.target.closest("th.sortable");
    if (th) {
      const key = th.dataset.sort;
      if (state.playerSort.key === key) state.playerSort.dir *= -1;
      else state.playerSort = { key, dir: typeof state.snapshot.players[0][key] === "string" ? 1 : -1 };
      renderPlayers();
      return;
    }
    const row = e.target.closest("tr[data-pid]");
    if (row) openPlayer(Number(row.dataset.pid));
  });

  els.leadersGrid.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-pid]");
    if (li) openPlayer(Number(li.dataset.pid));
  });

  els.playerSearch.addEventListener("input", (e) => {
    state.playerQuery = e.target.value;
    renderPlayers();
  });

  els.refreshInterval.addEventListener("change", (e) => {
    state.intervalMs = Number(e.target.value);
    schedule();
  });

  els.refreshNow.addEventListener("click", () => {
    els.refreshNow.classList.add("spin");
    load().then(() => setTimeout(() => els.refreshNow.classList.remove("spin"), 400));
  });

  els.modalClose.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (e) => { if (e.target === els.modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // ---------------- boot ----------------
  state.intervalMs = Number(els.refreshInterval.value);
  load();
  schedule();
})();
