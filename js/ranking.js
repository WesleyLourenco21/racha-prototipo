export function calculateRankingEntries(matches, period, today) {
    const month = today.slice(0, 7);
    const filteredMatches = matches.filter(match => {
        if (period === "day") return match.date === today;
        if (period === "month") return match.date.startsWith(month);
        return true;
    });
    const ranking = new Map();

    filteredMatches.forEach(match => {
        const teamCount = Math.max(match.teams?.length || 0, ...match.participants.map(participant => Number.isInteger(participant.team) ? participant.team + 1 : 0));
        const scores = Array.isArray(match.score) && match.score.length >= teamCount && match.score.every(Number.isFinite)
            ? match.score
            : Array.from({ length: teamCount }, (_, teamIndex) => match.participants.reduce((total, participant) => {
                const participantTeam = Number.isInteger(participant.team)
                    ? participant.team
                    : match.teams?.findIndex(team => team.includes(participant.id));
                return participantTeam === teamIndex ? total + Math.max(0, Number(match.stats[participant.id]?.goals) || 0) : total;
            }, 0));
        const winningTeam = scores.length > 1
            ? scores.reduce((best, score, index) => score > scores[best] ? index : best, 0)
            : -1;
        const hasWinner = winningTeam >= 0 && scores[winningTeam] > Math.max(...scores.filter((_, index) => index !== winningTeam));

        match.participants.forEach(participant => {
            const entry = ranking.get(participant.id) || { id: participant.id, name: participant.name, goals: 0, assists: 0, games: 0, wins: 0 };
            const stats = match.stats[participant.id] || {};
            const teamIndex = Number.isInteger(participant.team)
                ? participant.team
                : match.teams?.findIndex(team => team.includes(participant.id));
            entry.name = participant.name;
            entry.goals += Math.max(0, Number(stats.goals) || 0);
            entry.assists += Math.max(0, Number(stats.assists) || 0);
            entry.games += 1;
            if (hasWinner && teamIndex === winningTeam) entry.wins += 1;
            ranking.set(participant.id, entry);
        });
    });

    return [...ranking.values()].sort((first, second) => second.goals - first.goals || second.assists - first.assists || first.name.localeCompare(second.name, "pt-BR"));
}

export function calculateClubRecord(matches, club) {
    const playerIds = new Set(club.playerIds);
    return matches.reduce((record, match) => {
        const representedTeams = new Set();
        match.participants.forEach(participant => {
            if (!playerIds.has(participant.id)) return;
            const teamIndex = Number.isInteger(participant.team)
                ? participant.team
                : match.teams?.findIndex(team => team.includes(participant.id));
            if (Number.isInteger(teamIndex) && teamIndex >= 0) representedTeams.add(teamIndex);
        });
        if (representedTeams.size !== 1) return record;

        const clubTeam = [...representedTeams][0];
        const teamCount = Math.max(match.teams?.length || 0, ...match.participants.map(participant => Number.isInteger(participant.team) ? participant.team + 1 : 0));
        const scores = Array.isArray(match.score) && match.score.length >= teamCount && match.score.every(Number.isFinite)
            ? match.score
            : Array.from({ length: teamCount }, (_, teamIndex) => match.participants.reduce((total, participant) => {
                const participantTeam = Number.isInteger(participant.team)
                    ? participant.team
                    : match.teams?.findIndex(team => team.includes(participant.id));
                return participantTeam === teamIndex ? total + Math.max(0, Number(match.stats[participant.id]?.goals) || 0) : total;
            }, 0));
        if (clubTeam >= scores.length || scores.length < 2) return record;

        record.games += 1;
        record.goals += scores[clubTeam];
        const opponentScore = Math.max(...scores.filter((_, index) => index !== clubTeam));
        if (scores[clubTeam] > opponentScore) record.wins += 1;
        else if (scores[clubTeam] === opponentScore) record.draws += 1;
        else record.losses += 1;
        return record;
    }, { games: 0, wins: 0, draws: 0, losses: 0, goals: 0 });
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
        if (!entries.length) return `<div class="data-empty"><span class="ranking-empty-ball" aria-hidden="true">${renderPitchBall("ranking-empty-shell")}</span><p>Nenhuma partida registrada neste período.</p></div>`;
        return `<div class="table-scroll"><table class="ranking-table"><thead><tr><th>#</th><th>Jogador</th><th>Jogos</th><th>Gols</th><th>Assist.</th><th>Vitórias</th></tr></thead><tbody>${entries.map((entry, index) => `<tr><td><span class="ranking-position ${index < 3 ? `position-${index + 1}` : ""}">${String(index + 1).padStart(2, "0")}</span></td><th scope="row">${escapeHtml(entry.name)}</th><td>${entry.games}</td><td class="ranking-goals">${entry.goals}</td><td>${entry.assists}</td><td>${entry.wins}</td></tr>`).join("")}</tbody></table></div>`;
    }

    function renderLeaders(entries) {
        if (!entries.length) return "";
        const categories = [
            { title: "Artilheiro", metric: entry => entry.goals, suffix: "gols", order: (first, second) => second.goals - first.goals || second.assists - first.assists },
            { title: "Garçom", metric: entry => entry.assists, suffix: "assistências", order: (first, second) => second.assists - first.assists || second.goals - first.goals },
            { title: "MVP do período", metric: entry => entry.goals + entry.assists, suffix: "participações", order: (first, second) => (second.goals + second.assists) - (first.goals + first.assists) || second.games - first.games },
            { title: "Mais presente", metric: entry => entry.games, suffix: "jogos", order: (first, second) => second.games - first.games || second.wins - first.wins },
            { title: "Mais vitórias", metric: entry => entry.wins, suffix: "vitórias", order: (first, second) => second.wins - first.wins || second.games - first.games }
        ];
        return `<section class="ranking-highlights" aria-label="Destaques do período">${categories.map(category => {
            const leaders = entries.filter(entry => category.metric(entry) > 0).sort(category.order).slice(0, 3);
            if (!leaders.length) return "";
            return `<article class="ranking-highlight"><h2>${category.title}</h2><ol>${leaders.map((entry, index) => `<li><span class="ranking-position ${index < 3 ? `position-${index + 1}` : ""}">${["🥇", "🥈", "🥉"][index]}</span><strong>${escapeHtml(entry.name)}</strong><small>${category.metric(entry)} ${category.suffix}</small></li>`).join("")}</ol></article>`;
        }).join("")}</section><p class="ranking-mvp-note">MVP calculado pelas participações diretas (gols + assistências); empates são ordenados por jogos disputados.</p>`;
    }

    function renderRankings() {
        const period = getPeriod();
        const button = documentRef.querySelector(`[data-ranking-period="${period}"]`);
        documentRef.querySelectorAll("[data-ranking-period]").forEach(option => option.setAttribute("aria-pressed", String(option === button)));
        const entries = getRankingEntries(period);
        documentRef.querySelector("#ranking-list").innerHTML = `${renderLeaders(entries)}${renderRankingTable(entries)}`;
    }

    return { getRankingEntries, renderRankings };
}
