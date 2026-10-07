export function calculateRankingEntries(matches, period, today) {
    const month = today.slice(0, 7);
    const filteredMatches = matches.filter(match => period === "day" ? match.date === today : match.date.startsWith(month));
    const ranking = new Map();

    filteredMatches.forEach(match => match.participants.forEach(participant => {
        const entry = ranking.get(participant.id) || { id: participant.id, name: participant.name, goals: 0, assists: 0, games: 0 };
        const stats = match.stats[participant.id] || {};
        entry.name = participant.name;
        entry.goals += Math.max(0, Number(stats.goals) || 0);
        entry.assists += Math.max(0, Number(stats.assists) || 0);
        entry.games += 1;
        ranking.set(participant.id, entry);
    }));

    return [...ranking.values()].sort((first, second) => second.goals - first.goals || second.assists - first.assists || first.name.localeCompare(second.name, "pt-BR"));
}

export function createRankingController({
    documentRef,
    matches,
    getPeriod,
    localDateKey,
    escapeHtml,
    renderPitchBall
}) {
    function getRankingEntries(period) {
        return calculateRankingEntries(matches, period, localDateKey());
    }

    function renderRankingTable(entries) {
        if (!entries.length) return `<div class="data-empty"><span class="ranking-empty-ball" aria-hidden="true">${renderPitchBall("ranking-empty-shell")}</span><p>Nenhum gol ou assistência registrado neste período.</p></div>`;
        return `<div class="table-scroll"><table class="ranking-table"><thead><tr><th>#</th><th>Jogador</th><th>Jogos</th><th>Gols</th><th>Assist.</th></tr></thead><tbody>${entries.map((entry, index) => `<tr><td><span class="ranking-position ${index < 3 ? `position-${index + 1}` : ""}">${String(index + 1).padStart(2, "0")}</span></td><th scope="row">${escapeHtml(entry.name)}</th><td>${entry.games}</td><td class="ranking-goals">${entry.goals}</td><td>${entry.assists}</td></tr>`).join("")}</tbody></table></div>`;
    }

    function renderRankings() {
        const period = getPeriod();
        const button = documentRef.querySelector(`[data-ranking-period="${period}"]`);
        documentRef.querySelectorAll("[data-ranking-period]").forEach(option => option.setAttribute("aria-pressed", String(option === button)));
        documentRef.querySelector("#ranking-list").innerHTML = renderRankingTable(getRankingEntries(period));
    }

    return { getRankingEntries, renderRankings };
}
