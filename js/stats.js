export function countMatchesThisMonth(matches, date) {
    const month = date.slice(0, 7);
    return matches.filter(match => match.date.startsWith(month)).length;
}

export function countPendingPayments(matches) {
    return matches.reduce((total, match) => total + match.participants.filter(participant => !match.payments[participant.id]).length, 0);
}

export function getRecentMatches(matches, limit = matches.length) {
    return [...matches]
        .sort((first, second) => `${second.date}${second.time || ""}`.localeCompare(`${first.date}${first.time || ""}`))
        .slice(0, limit);
}
