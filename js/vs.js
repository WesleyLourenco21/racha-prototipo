function createId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createVS(homeClubId, awayClubId) {
    return {
        id: createId(),
        homeClubId,
        awayClubId,
        homePlayers: [],
        awayPlayers: [],
        homeScore: 0,
        awayScore: 0,
        status: "scheduled"
    };
}

export function selectPlayerForVS(vs, playerId, club) {
    if (!vs || typeof playerId !== "string" || !playerId) return false;
    const players = club === "home" ? vs.homePlayers : club === "away" ? vs.awayPlayers : null;
    if (!players || players.includes(playerId)) return false;
    players.push(playerId);
    return true;
}

export function createVsController({
    players,
    getTeams,
    getComparisonPlayerIds,
    statGroups,
    calculateOverall,
    escapeHtml
}) {
    function categoryRating(player, group) {
        const average = group.stats.reduce((total, [key]) => total + player.stats[key], 0) / group.stats.length;
        return Math.round(average);
    }

    function renderPlayerComparison() {
        const comparisonPlayerIds = getComparisonPlayerIds();
        const teams = getTeams();
        if (!comparisonPlayerIds || !teams) return "";
        const comparison = comparisonPlayerIds.map(id => {
            const player = players.find(item => item.id === id);
            return player ? { player, teamIndex: teams.findIndex(team => team.some(item => item.id === id)) } : null;
        });
        if (comparison.some(entry => !entry)) return "";

        const ratings = comparison.map(entry => calculateOverall(entry.player));
        const difference = Math.abs(ratings[0] - ratings[1]);
        const maximum = Math.max(...ratings, 1);
        const advantage = difference === 0 ? "GER iguais" : `${escapeHtml(comparison[ratings[0] > ratings[1] ? 0 : 1].player.name)} +${difference} GER`;
        const competitors = comparison.map(({ player, teamIndex }, index) => `<article class="compare-player compare-${index === 0 ? "left" : "right"}">
        <span class="compare-team-name">Time ${teamIndex === 0 ? "A" : "B"}</span>
        <strong class="compare-player-name">${escapeHtml(player.name)}</strong>
        <div class="compare-rating"><b>${ratings[index]}</b><span>GER</span></div>
        <div class="compare-meter" aria-hidden="true"><span style="--compare-fill: ${Math.round(ratings[index] / maximum * 100)}%"></span></div>
      </article>`).join("");
        const categoryRows = statGroups.map(group => {
            const firstValue = categoryRating(comparison[0].player, group);
            const secondValue = categoryRating(comparison[1].player, group);
            const firstState = firstValue > secondValue ? "is-better" : firstValue < secondValue ? "is-behind" : "is-tied";
            const secondState = secondValue > firstValue ? "is-better" : secondValue < firstValue ? "is-behind" : "is-tied";
            return `<div class="comparison-stat-row" role="row">
            <b class="comparison-stat-value ${firstState}" role="cell" title="${firstValue > secondValue ? "Maior nota nesta habilidade" : ""}">${firstValue}</b>
            <span class="comparison-stat-name" role="cell">${group.name}</span>
            <b class="comparison-stat-value ${secondState}" role="cell" title="${secondValue > firstValue ? "Maior nota nesta habilidade" : ""}">${secondValue}</b>
        </div>`;
        }).join("");

        return `<section class="player-comparison" aria-label="Comparação de jogadores" aria-live="polite">
        <div class="comparison-heading"><div><p class="eyebrow">Confronto direto</p><h3>Comparação de jogadores</h3></div><button class="icon-btn comparison-clear" type="button" aria-label="Limpar comparação" title="Limpar comparação">×</button></div>
        <div class="comparison-pair">${competitors}<div class="comparison-versus"><strong>VS</strong><span>${advantage}</span></div></div>
        <div class="comparison-stats" role="table" aria-label="Comparação por habilidade">
            <div class="comparison-stat-row comparison-stat-heading" role="row"><span role="columnheader">${escapeHtml(comparison[0].player.name)}</span><strong role="columnheader">Habilidade</strong><span role="columnheader">${escapeHtml(comparison[1].player.name)}</span></div>
            ${categoryRows}
        </div>
    </section>`;
    }

    return { renderPlayerComparison };
}
