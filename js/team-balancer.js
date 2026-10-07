export function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
}

export function buildBalancedTeams(pool, selectedGoalkeeperIds, calculateOverall) {
    const shuffledPool = shuffle(pool);
    const selectedGoalkeepers = shuffledPool.filter(player => selectedGoalkeeperIds.has(player.id));
    const playersList = shuffledPool.filter(player => !selectedGoalkeepers.includes(player)).sort((first, second) => calculateOverall(second) - calculateOverall(first));
    const teams = [[], []];
    const totals = teams.map(team => team.reduce((total, player) => total + calculateOverall(player), 0));

    selectedGoalkeepers.forEach(player => {
        const teamIndex = teams[0].length <= teams[1].length ? 0 : 1;
        teams[teamIndex].push(player);
        totals[teamIndex] += calculateOverall(player);
    });

    playersList.forEach(player => {
        const playerOverall = calculateOverall(player);
        const teamChoices = [
            {
                index: 0,
                score: Math.abs((totals[0] + playerOverall) - totals[1]) + Math.max(0, (teams[1].length - teams[0].length)) * 5
            },
            {
                index: 1,
                score: Math.abs((totals[1] + playerOverall) - totals[0]) + Math.max(0, (teams[0].length - teams[1].length)) * 5
            }
        ];

        const choice = shuffle(teamChoices).reduce((best, current) => current.score < best.score ? current : best);
        teams[choice.index].push(player);
        totals[choice.index] += playerOverall;
    });

    while (teams[0].length - teams[1].length > 1) {
        const playerIndex = teams[0].findLastIndex(player => !selectedGoalkeepers.includes(player));
        if (playerIndex < 0) break;
        teams[1].push(teams[0].splice(playerIndex, 1)[0]);
    }
    while (teams[1].length - teams[0].length > 1) {
        const playerIndex = teams[1].findLastIndex(player => !selectedGoalkeepers.includes(player));
        if (playerIndex < 0) break;
        teams[0].push(teams[1].splice(playerIndex, 1)[0]);
    }

    return teams;
}
