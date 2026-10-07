import { Storage } from "./storage.js";

const STORAGE_KEY = "racha.players.v1";

export function loadPlayers(normalizationOptions) {
    return normalizePlayers(Storage.get(STORAGE_KEY, []), normalizationOptions);
}

export function savePlayers(players) {
    return Storage.set(STORAGE_KEY, players);
}

export function normalizePlayers(saved, {
    allStatGroups,
    legacyGroupIndexes,
    previousProfileDefaults,
    quickProfiles,
    growthNodeIds,
    matches,
    createId,
    clampStat
}) {
    if (!Array.isArray(saved)) return [];

    return saved.filter(player => player && typeof player.name === "string" && player.name.trim()).map(player => {
        const stats = {};
        allStatGroups.forEach(group => {
            const legacyIndex = legacyGroupIndexes[group.key];
            const legacyRating = Array.isArray(player.skills) && legacyIndex !== undefined ? Number(player.skills[legacyIndex]) : NaN;
            const groupValue = Number(player.stats?.[group.key]);
            const migratedRating = legacyRating === 3 ? 50 : Math.round(legacyRating * 20);
            group.stats.forEach(([key, , defaultValue]) => {
                const value = Number(player.stats?.[key]);
                const fallback = Number.isFinite(groupValue) ? clampStat(groupValue === previousProfileDefaults[group.key] ? 50 : groupValue) : Number.isFinite(legacyRating) ? clampStat(migratedRating) : defaultValue;
                stats[key] = Number.isFinite(value) ? clampStat(value === previousProfileDefaults[key] ? 50 : value) : fallback;
            });
        });
        const profileList = Array.isArray(player.quickProfile)
            ? player.quickProfile
            : Object.hasOwn(quickProfiles, player.quickProfile) ? [player.quickProfile] : ["geral"];
        const validProfiles = profileList.filter(name => Object.hasOwn(quickProfiles, name));
        return {
            id: typeof player.id === "string" ? player.id : createId(),
            name: player.name.trim().slice(0, 32),
            stats,
            quickProfile: validProfiles.length ? validProfiles : ["geral"],
            height: Number(player.height) || 0,
            weight: Number(player.weight) || 0,
            weakFoot: Math.min(5, Math.max(1, Math.round(Number(player.weakFoot) || 2))),
            growthPoints: Number.isFinite(Number(player.growthPoints)) ? Math.max(0, Math.floor(Number(player.growthPoints))) : matches.filter(match => match.participants.some(participant => participant.id === player.id)).length,
            growthNodes: Array.isArray(player.growthNodes) ? player.growthNodes.filter(node => growthNodeIds.has(node)) : [],
            premium: player.premium === true
        };
    });
}

export function createPlayer(name, profileNames, height, weight, {
    matchMode,
    allStatGroups,
    quickProfiles,
    createId,
    applyQuickProfile
}) {
    const stats = {};
    const defaultRating = matchMode === "professional" ? 58 : 50;
    allStatGroups.forEach(group => {
        group.stats.forEach(([key]) => { stats[key] = defaultRating; });
    });
    const selection = Array.isArray(profileNames) ? profileNames : [profileNames];
    return {
        id: createId(),
        name,
        stats: applyQuickProfile(stats, selection, height, weight),
        quickProfile: selection,
        height,
        weight,
        weakFoot: Math.max(2, ...selection.map(profile => quickProfiles[profile]?.weakFoot || 0)),
        growthPoints: 0,
        growthNodes: [],
        premium: false
    };
}

export function calculatePlayerOverall(player, matchMode, statGroups) {
    const ratings = statGroups.flatMap(group => group.stats.map(([key]) => player.stats[key]));
    if (matchMode === "resenha") return 60;
    if (player.premium) return 96;
    const average = ratings.reduce((total, value) => total + value, 0) / ratings.length;
    return Math.min(93, Math.round(average * 0.45 + 48));
}

export function calculatePlayerStars(player, matchMode, statGroups) {
    if (matchMode === "professional" && player.premium) return 6;
    const overall = calculatePlayerOverall(player, matchMode, statGroups);
    return Math.max(1, Math.min(5, Math.round((1 + (overall - 1) * 4 / 98) * 2) / 2));
}
