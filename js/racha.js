import { Storage } from "./storage.js";

const MATCHES_STORAGE_KEY = "racha.matches.v1";
const GAME_SETUP_STORAGE_KEY = "racha.game-setup.v1";

export function loadMatches() {
    return normalizeMatches(Storage.get(MATCHES_STORAGE_KEY, []));
}

export function saveMatches(matches) {
    return Storage.set(MATCHES_STORAGE_KEY, matches);
}

export function loadGameSetup(today = localDateKey()) {
    return normalizeGameSetup(Storage.get(GAME_SETUP_STORAGE_KEY, {}), today);
}

export function saveGameSetup(setup) {
    return Storage.set(GAME_SETUP_STORAGE_KEY, setup);
}

export function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

export function normalizeMatches(saved) {
    if (!Array.isArray(saved)) return [];
    return saved.filter(match => match && typeof match.id === "string" && typeof match.date === "string" && Array.isArray(match.teams) && Array.isArray(match.participants) && match.stats && typeof match.stats === "object" && match.payments && typeof match.payments === "object");
}

export function normalizeGameSetup(saved, today) {
    saved = saved && typeof saved === "object" ? saved : {};
    const defaults = { date: today, time: "21:00", venue: "", fee: 0, mode: "resenha" };
    return {
        date: /^\d{4}-\d{2}-\d{2}$/.test(saved.date || "") ? saved.date : defaults.date,
        time: /^\d{2}:\d{2}$/.test(saved.time || "") ? saved.time : defaults.time,
        venue: typeof saved.venue === "string" ? saved.venue.slice(0, 200) : defaults.venue,
        fee: Number.isFinite(Number(saved.fee)) ? Math.max(0, Number(saved.fee)) : defaults.fee,
        mode: defaults.mode
    };
}

export function createMatchRecord({ teams, stats, setup, mode, teamCaptains, createId }) {
    const participants = teams.flatMap((team, teamIndex) => team.map(player => ({ id: player.id, name: player.name, team: teamIndex })));
    const score = teams.map(team => team.reduce((total, player) => total + stats[player.id].goals, 0));
    return {
        id: createId(),
        date: setup.date,
        time: setup.time,
        venue: setup.venue,
        fee: setup.fee,
        mode: setup.mode || mode,
        teamCaptains: [...teamCaptains],
        teams: teams.map(team => team.map(player => player.id)),
        participants,
        stats,
        score,
        payments: Object.fromEntries(participants.map(participant => [participant.id, false]))
    };
}
