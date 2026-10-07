import { Storage } from "./storage.js";

const STORAGE_KEY = "racha.clubs.v1";

export function getClubs() {
    const clubs = Storage.get(STORAGE_KEY, []);
    return Array.isArray(clubs) ? clubs : [];
}

export function saveClubs(clubs) {
    return Storage.set(STORAGE_KEY, clubs);
}

export function createClub(data) {
    if (!data || typeof data.name !== "string" || !data.name.trim() || typeof data.captainId !== "string" || !data.captainId) {
        throw new TypeError("O clube precisa de um nome e de um capitão.");
    }

    const clubs = getClubs();
    const club = {
        id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: data.name.trim(),
        logo: data.logo || null,
        city: typeof data.city === "string" ? data.city.trim() : "",
        captainId: data.captainId,
        players: [],
        stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0 }
    };

    clubs.push(club);
    if (!saveClubs(clubs)) throw new Error("Não foi possível salvar os clubes neste navegador.");
    return club;
}
