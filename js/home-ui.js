import { countMatchesThisMonth, countPendingPayments, getRecentMatches } from "./stats.js";

export function createHomeController({
    documentRef,
    getMatches,
    getPlayers,
    getToday,
    getRankingEntries,
    escapeHtml,
    formatMatchDate
}) {
    function renderRecentMatch(match, compact = false) {
        const score = match.score || [0, 0];
        const venue = match.venue ? ` · ${escapeHtml(match.venue)}` : "";
        const details = match.participants.map(participant => {
            const stats = match.stats[participant.id] || {};
            const goals = Number(stats.goals) || 0;
            const assists = Number(stats.assists) || 0;
            return goals || assists ? `<span>${escapeHtml(participant.name)} <b>${goals}G · ${assists}A</b></span>` : "";
        }).filter(Boolean).join("");
        return `<article class="history-match ${compact ? "history-match-compact" : ""}">
        <div class="history-match-head"><div><time>${formatMatchDate(match.date)}${match.time ? ` · ${escapeHtml(match.time)}` : ""}</time><h3>${venue ? venue.slice(3) : "Jogo do racha"}</h3></div><div class="history-score"><span>Time A</span><strong>${score[0] || 0} <i>×</i> ${score[1] || 0}</strong><span>Time B</span></div></div>
        ${details ? `<div class="history-contributions">${details}</div>` : '<p class="history-no-events">Partida registrada sem gols ou assistências.</p>'}
        ${compact ? "" : `<div class="history-match-footer"><span>${match.participants.length} jogadores</span><button class="text-action" type="button" data-view-target="payments">Ver pagamentos →</button></div>`}
      </article>`;
    }

    function renderHistory() {
        const matches = getMatches();
        const orderedMatches = getRecentMatches(matches);
        documentRef.querySelector("#history-list").innerHTML = orderedMatches.length
            ? orderedMatches.map(match => renderRecentMatch(match)).join("")
            : '<div class="data-empty"><span aria-hidden="true">◷</span><p>As partidas registradas vão aparecer aqui.</p></div>';
    }

    function renderHome() {
        const matches = getMatches();
        const today = getToday();
        documentRef.querySelector("#home-player-count").textContent = getPlayers().length;
        documentRef.querySelector("#home-match-count").textContent = countMatchesThisMonth(matches, today);
        documentRef.querySelector("#home-pending-count").textContent = countPendingPayments(matches);
        const leaders = getRankingEntries("day").filter(entry => entry.goals || entry.assists).slice(0, 3);
        documentRef.querySelector("#home-today-leaders").innerHTML = leaders.length
            ? leaders.map((entry, index) => `<div class="home-leader"><span class="home-leader-rank">${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(entry.name)}</strong><span>${entry.goals} G · ${entry.assists} A</span></div>`).join("")
            : '<p class="home-empty-note">Os destaques aparecem depois de registrar uma partida.</p>';
        const recentMatches = getRecentMatches(matches, 3);
        documentRef.querySelector("#home-recent-games").innerHTML = recentMatches.length
            ? recentMatches.map(match => renderRecentMatch(match, true)).join("")
            : '<p class="home-empty-note">Nenhum jogo registrado ainda.</p>';
    }

    return { renderHome, renderHistory };
}
