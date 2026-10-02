"use strict";

const STORAGE_KEY = "racha.players.v1";
const SETTINGS_KEY = "racha.settings.v1";
const MATCHES_KEY = "racha.matches.v1";
const GAME_SETUP_KEY = "racha.game-setup.v1";
const PROFESSIONAL_TEAMS_KEY = "racha.professional-teams.v1";
const TEST_SESSION_KEY = "racha.test-session.v1";
const TEST_SESSION_TAB_KEY = "racha.test-session-tab.v1";
const TEST_SESSION_ACTIVITY_KEY = "racha.test-session-activity.v1";
const DEVELOPMENT_TEST_RESET = true;
const TEST_SESSION_TAB_TTL = 90000;
const musicTracks = ["assets/audio/Torça Com a gente.mp3", "assets/audio/Torcida em Alta.mp3"];

function getActiveDevelopmentTabs() {
    try {
        const saved = JSON.parse(localStorage.getItem(TEST_SESSION_ACTIVITY_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved.filter(tab => tab && typeof tab.id === "string" && Date.now() - Number(tab.lastSeen) < TEST_SESSION_TAB_TTL);
    } catch {
        return [];
    }
}

function markDevelopmentSessionActive() {
    if (!DEVELOPMENT_TEST_RESET) return;
    try {
        const tabId = sessionStorage.getItem(TEST_SESSION_TAB_KEY) || createId();
        sessionStorage.setItem(TEST_SESSION_TAB_KEY, tabId);
        const activeTabs = getActiveDevelopmentTabs().filter(tab => tab.id !== tabId);
        activeTabs.push({ id: tabId, lastSeen: Date.now() });
        localStorage.setItem(TEST_SESSION_ACTIVITY_KEY, JSON.stringify(activeTabs));
    } catch {}
}

function markDevelopmentSessionClosed() {
    try {
        const tabId = sessionStorage.getItem(TEST_SESSION_TAB_KEY);
        if (!tabId) return;
        const activeTabs = getActiveDevelopmentTabs().filter(tab => tab.id !== tabId);
        localStorage.setItem(TEST_SESSION_ACTIVITY_KEY, JSON.stringify(activeTabs));
    } catch {}
}

function resetDevelopmentSession() {
    if (!DEVELOPMENT_TEST_RESET) return;
    try {
        if (sessionStorage.getItem(TEST_SESSION_KEY) === "initialized") {
            markDevelopmentSessionActive();
            return;
        }
        if (getActiveDevelopmentTabs().length === 0) {
            [STORAGE_KEY, MATCHES_KEY, GAME_SETUP_KEY, PROFESSIONAL_TEAMS_KEY].forEach(key => localStorage.removeItem(key));
        }
        sessionStorage.setItem(TEST_SESSION_KEY, "initialized");
        markDevelopmentSessionActive();
    } catch {}
}

resetDevelopmentSession();
window.setInterval(markDevelopmentSessionActive, 25000);
window.addEventListener("pageshow", markDevelopmentSessionActive);
window.addEventListener("pagehide", markDevelopmentSessionClosed);
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) markDevelopmentSessionActive();
});
document.addEventListener("pointerdown", markDevelopmentSessionActive);
const legacyGroupIndexes = { shooting: 0, passing: 1, dribbling: 2, defending: 3, physical: 4 };
const previousProfileDefaults = { pace: 92, acceleration: 89, sprintSpeed: 95, shooting: 76, attPosition: 86, finishing: 78, shotPower: 74, longShots: 75, volleys: 73, penalties: 59, passing: 78, vision: 79, crossing: 81, freeKickAcc: 64, shortPass: 83, longPass: 64, curve: 80, dribbling: 84, agility: 88, balance: 64, reactions: 81, ballControl: 85, dribblingSkill: 86, composure: 79, defending: 39, interceptions: 39, headingAcc: 69, defAware: 34, standTackle: 39, slideTackle: 28, physical: 67, jumping: 79, stamina: 75, strength: 64, aggression: 60 };
const statGroups = [
    { key: "pace", name: "Ritmo", stats: [["acceleration", "Aceleração", 50], ["sprintSpeed", "Velocidade de corrida", 50], ["ballSpeed", "Velocidade com a bola", 50]] },
    { key: "shooting", name: "Finalização", stats: [["attPosition", "Posicionamento de ataque", 50], ["finishing", "Conclusão", 50], ["shotPower", "Potência do chute", 50]] },
    { key: "passing", name: "Passe", stats: [["vision", "Visão", 50], ["shortPass", "Passe curto", 50], ["longPass", "Passe longo", 50]] },
    { key: "dribbling", name: "Drible", stats: [["agility", "Agilidade", 50], ["ballControl", "Controle de bola", 50], ["dribblingSkill", "Drible", 50]] },
    { key: "defending", name: "Defesa", stats: [["interceptions", "Interceptações", 50], ["defAware", "Noção defensiva", 50], ["standTackle", "Desarme em pé", 50]] },
    { key: "physical", name: "Físico", stats: [["stamina", "Fôlego", 50], ["strength", "Força", 50], ["jumping", "Impulsão", 50]] }
];
const specialGroups = [
    { key: "technique", name: "Técnica especial", stats: [["crossing", "Cruzamento", 50], ["setPieces", "Bola parada", 50], ["balance", "Equilíbrio", 50], ["headingAcc", "Cabeceio", 50]] },
    { key: "defenseSpecial", name: "Defesa especial", stats: [["slideTackle", "Carrinho", 50]] },
    { key: "mental", name: "Mentalidade", stats: [["reactions", "Reação", 50], ["composure", "Compostura", 50], ["leadership", "Liderança", 50], ["aggression", "Intensidade", 50]] },
    { key: "goalkeeping", name: "Goleiro", stats: [["diving", "Elasticidade", 50], ["handling", "Defesa de bola", 50], ["kicking", "Reposição", 50], ["reflexes", "Reflexos", 50], ["positioning", "Posicionamento", 50]] }
];
const allStatGroups = [...statGroups, ...specialGroups];
const rosterElement = document.querySelector("#roster");
const evolutionRosterElement = document.querySelector("#evolution-roster");
const teamsArea = document.querySelector("#teams-area");
const recordingArea = document.querySelector("#match-recording");
const drawButton = document.querySelector("#draw-button");
let teams = null;
let teamCaptainIds = [null, null];
let selectedPlayerId = null;
let comparisonPlayerIds = null;
let selectionMode = "swap";
let playerCreationMode = "quick";
let activePresets = new Set(["geral"]);
let toastTimer;
let customCrowdUrl = null;
let customMusicUrl = null;
let customMusicAudio = null;
let stadiumAudio = null;
let audioPreloadPromise;
const bundledAudioUrls = new Map();
const bundledAudioPaths = [
    "assets/audio/football-crowd-cheer.mp3",
    "assets/audio/referee-whistle.mp3"
];
const themePalettes = {
    gramado: { green: "#45b963", lime: "#c5f36b", pale: "#1d3525", field: "#164b32" },
    oceano: { green: "#35a9eb", lime: "#8be0ff", pale: "#193447", field: "#153c54" },
    coral: { green: "#ff7064", lime: "#ffc17d", pale: "#422a27", field: "#563029" },
    violeta: { green: "#ae8bff", lime: "#d7c3ff", pale: "#332947", field: "#382b51" },
    dourado: { green: "#e1ad2d", lime: "#ffdc76", pale: "#40351d", field: "#51431e" },
    neve: { green: "#a8c1c5", lime: "#e7f5f5", pale: "#26393b", field: "#26474c" },
    grafite: { green: "#89968e", lime: "#e5ebe7", pale: "#2c3630", field: "#303d35" },
    rubi: { green: "#ed5570", lime: "#ffa0ae", pale: "#40242c", field: "#4c2830" }
};
const audioSettings = loadAudioSettings();
let matches = loadMatches();
let gameSetup = loadGameSetup();
let matchMode = gameSetup.mode;
let activeMatchSetup = null;
let activeMatchId = null;
let rankingPeriod = "day";
let activeProfessionalTab = "teams";

function loadAudioSettings() {
    const defaults = { effectsEnabled: true, effectsVolume: 35, musicEnabled: false, musicVolume: 32, musicTrack: musicTracks[0], theme: "gramado", mode: "dark" };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
        return {
            effectsEnabled: saved.effectsEnabled !== false,
            effectsVolume: clampVolume(saved.effectsVolume ?? defaults.effectsVolume),
            musicEnabled: saved.musicEnabled === true,
            musicVolume: clampVolume(saved.musicVolume ?? defaults.musicVolume),
            musicTrack: musicTracks.includes(saved.musicTrack) ? saved.musicTrack : defaults.musicTrack,
            theme: Object.hasOwn(themePalettes, saved.theme) ? saved.theme : defaults.theme,
            mode: saved.mode === "light" ? "light" : defaults.mode
        };
    } catch {
        return defaults;
    }
}

function clampVolume(value) {
    return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

function saveAudioSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(audioSettings));
    } catch {
        showToast("Não foi possível salvar as opções neste navegador.");
    }
}

function applyTheme(theme) {
    const palette = themePalettes[theme] || themePalettes.gramado;
    const mode = audioSettings.mode === "light" ? "light" : "dark";
    document.documentElement.dataset.mode = mode;
    document.documentElement.style.colorScheme = mode;
    document.documentElement.style.setProperty("--green", palette.green);
    document.documentElement.style.setProperty("--lime", palette.lime);
    document.documentElement.style.setProperty("--green-pale", palette.pale);
    document.documentElement.style.setProperty("--field-color", palette.field);
    document.querySelectorAll(".theme-choice").forEach(button => {
        const selected = button.dataset.theme === theme;
        button.setAttribute("aria-pressed", String(selected));
    });
    document.querySelectorAll(".mode-choice").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
    });
    document.querySelector('meta[name="theme-color"]').content = mode === "light" ? "#e2e9e3" : "#0d1410";
}

function updateAudioControls() {
    document.querySelector("#effects-toggle").checked = audioSettings.effectsEnabled;
    document.querySelector("#effects-volume").value = audioSettings.effectsVolume;
    document.querySelector("#effects-volume-value").textContent = `${audioSettings.effectsVolume}%`;
    document.querySelector("#music-toggle").checked = audioSettings.musicEnabled;
    document.querySelector("#music-volume").value = audioSettings.musicVolume;
    document.querySelector("#music-volume-value").textContent = `${audioSettings.musicVolume}%`;
    document.querySelector("#music-track").value = audioSettings.musicTrack;
    document.querySelector("#crowd-audio-name").textContent = customCrowdUrl ? "Áudio carregado; toca ao sortear ou trocar times." : "Opcional: carregue um canto ou torcida do aparelho.";
    document.querySelector("#music-audio-name").textContent = customMusicUrl ? "Faixa do aparelho ativa nesta sessão." : "As duas faixas RACHA estão disponíveis acima.";
}

function preloadBundledAudio() {
    if (!audioPreloadPromise) {
        audioPreloadPromise = Promise.all(bundledAudioPaths.map(async path => {
            try {
                const response = await fetch(path);
                if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
                const audioBlob = await response.blob();
                bundledAudioUrls.set(path, URL.createObjectURL(audioBlob));
            } catch {
                bundledAudioUrls.set(path, null);
            }
        }));
    }
    return audioPreloadPromise;
}

function playLocalAudio(path, volume, { delay = 0, maxDuration = 0 } = {}) {
    if (volume <= 0) return null;
    const source = bundledAudioPaths.includes(path) ? bundledAudioUrls.get(path) : path;
    if (source === undefined) {
        preloadBundledAudio().then(() => playLocalAudio(path, volume, { delay, maxDuration }));
        return null;
    }
    if (!source) {
        showToast("Não foi possível carregar o áudio do jogo.");
        return null;
    }
    const audio = new Audio(source);
    audio.volume = Math.min(0.25, volume * 0.25);
    audio.preload = "auto";
    const play = () => {
        audio.play().catch(() => {});
        if (maxDuration > 0) window.setTimeout(() => audio.pause(), maxDuration * 1000);
    };
    if (delay > 0) window.setTimeout(play, delay * 1000);
    else play();
    return audio;
}

function playCustomCrowd(volume, delay = 0) {
    if (customCrowdUrl) return playLocalAudio(customCrowdUrl, volume, { delay });
    return playLocalAudio("assets/audio/football-crowd-cheer.mp3", volume, { delay });
}

function playEffect(action) {
    if (!audioSettings.effectsEnabled || audioSettings.effectsVolume === 0) return;
    const level = audioSettings.effectsVolume / 100;
    if (action === "draw") {
        playLocalAudio("assets/audio/referee-whistle.mp3", level * 0.85, { maxDuration: 1.6 });
        playCustomCrowd(level, 0.45);
    } else if (action === "swap") {
        playCustomCrowd(level * 0.7);
    }
}

function stopBackgroundMusic() {
    for (const audio of [customMusicAudio, stadiumAudio]) {
        if (!audio) continue;
        audio.pause();
        audio.currentTime = 0;
    }
    stadiumAudio = null;
}

function startBackgroundMusic() {
    if (!audioSettings.musicEnabled || audioSettings.musicVolume === 0) return;
    const audio = customMusicAudio || (stadiumAudio ||= new Audio(audioSettings.musicTrack));
    audio.loop = true;
    audio.volume = audioSettings.musicVolume / 100 * 0.22;
    audio.preload = "auto";
    audio.play().catch(() => showToast("Toque para iniciar o áudio neste navegador."));
}

function syncBackgroundMusic() {
    stopBackgroundMusic();
    if (audioSettings.musicEnabled && audioSettings.musicVolume > 0) startBackgroundMusic();
}

function initializeSettings() {
    applyTheme(audioSettings.theme);
    updateAudioControls();
    document.querySelector("#settings-open").addEventListener("click", () => {
        document.querySelector("#settings-dialog").showModal();
        if (audioSettings.musicEnabled) startBackgroundMusic();
    });
    document.addEventListener("pointerdown", () => {
        if (audioSettings.musicEnabled) startBackgroundMusic();
    }, { once: true });
    document.querySelectorAll(".theme-choice").forEach(button => button.addEventListener("click", () => {
        audioSettings.theme = button.dataset.theme;
        applyTheme(audioSettings.theme);
        saveAudioSettings();
    }));
    document.querySelectorAll(".mode-choice").forEach(button => button.addEventListener("click", () => {
        audioSettings.mode = button.dataset.mode;
        applyTheme(audioSettings.theme);
        saveAudioSettings();
    }));
    document.querySelector("#effects-toggle").addEventListener("change", event => {
        audioSettings.effectsEnabled = event.target.checked;
        saveAudioSettings();
    });
    document.querySelector("#effects-volume").addEventListener("input", event => {
        audioSettings.effectsVolume = clampVolume(event.target.value);
        document.querySelector("#effects-volume-value").textContent = `${audioSettings.effectsVolume}%`;
        saveAudioSettings();
    });
    document.querySelector("#music-toggle").addEventListener("change", event => {
        audioSettings.musicEnabled = event.target.checked;
        saveAudioSettings();
        syncBackgroundMusic();
    });
    document.querySelector("#music-volume").addEventListener("input", event => {
        audioSettings.musicVolume = clampVolume(event.target.value);
        document.querySelector("#music-volume-value").textContent = `${audioSettings.musicVolume}%`;
        saveAudioSettings();
        for (const audio of [customMusicAudio, stadiumAudio]) {
            if (audio) audio.volume = audioSettings.musicVolume / 100 * 0.22;
        }
        if (audioSettings.musicEnabled && audioSettings.musicVolume > 0) startBackgroundMusic();
        else if (audioSettings.musicVolume === 0) stopBackgroundMusic();
    });
    document.querySelector("#music-track").addEventListener("change", event => {
        audioSettings.musicTrack = musicTracks.includes(event.target.value) ? event.target.value : musicTracks[0];
        stopBackgroundMusic();
        if (customMusicUrl) URL.revokeObjectURL(customMusicUrl);
        customMusicUrl = null;
        customMusicAudio = null;
        document.querySelector("#music-audio-file").value = "";
        updateAudioControls();
        syncBackgroundMusic();
        saveAudioSettings();
    });
    document.querySelector("#crowd-audio-file").addEventListener("change", event => {
        const [file] = event.target.files;
        if (!file) return;
        if (customCrowdUrl) URL.revokeObjectURL(customCrowdUrl);
        customCrowdUrl = URL.createObjectURL(file);
        updateAudioControls();
        showToast("Áudio da torcida carregado para esta sessão.");
    });
    document.querySelector("#crowd-audio-preview").addEventListener("click", () => {
        if (customCrowdUrl) playCustomCrowd(audioSettings.effectsVolume / 100);
        else playLocalAudio("assets/audio/football-crowd-cheer.mp3", audioSettings.effectsVolume / 100);
    });
    document.querySelector("#music-audio-file").addEventListener("change", event => {
        const [file] = event.target.files;
        if (!file) return;
        stopBackgroundMusic();
        if (customMusicUrl) URL.revokeObjectURL(customMusicUrl);
        customMusicUrl = URL.createObjectURL(file);
        customMusicAudio = new Audio(customMusicUrl);
        customMusicAudio.loop = true;
        customMusicAudio.preload = "auto";
        audioSettings.musicEnabled = true;
        updateAudioControls();
        saveAudioSettings();
        syncBackgroundMusic();
        showToast("Sua trilha começou a tocar.");
    });
    document.querySelector("#settings-reset").addEventListener("click", () => {
        stopBackgroundMusic();
        if (customCrowdUrl) URL.revokeObjectURL(customCrowdUrl);
        if (customMusicUrl) URL.revokeObjectURL(customMusicUrl);
        customCrowdUrl = null;
        customMusicUrl = null;
        customMusicAudio = null;
        document.querySelector("#crowd-audio-file").value = "";
        document.querySelector("#music-audio-file").value = "";
        Object.assign(audioSettings, { effectsEnabled: true, effectsVolume: 35, musicEnabled: false, musicVolume: 32, musicTrack: musicTracks[0], theme: "gramado", mode: "dark" });
        applyTheme(audioSettings.theme);
        updateAudioControls();
        syncBackgroundMusic();
        saveAudioSettings();
        showToast("Opções restauradas.");
    });
    document.querySelector("#settings-dialog").addEventListener("click", event => {
        if (event.target === event.currentTarget) event.currentTarget.close();
    });
}

function loadPlayers() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
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
    } catch {
        return [];
    }
}

function savePlayers() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(players));
    } catch {
        showToast("Não foi possível salvar neste navegador.");
    }
}

function localDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function loadMatches() {
    try {
        const saved = JSON.parse(localStorage.getItem(MATCHES_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved.filter(match => match && typeof match.id === "string" && typeof match.date === "string" && Array.isArray(match.teams) && Array.isArray(match.participants) && match.stats && typeof match.stats === "object" && match.payments && typeof match.payments === "object");
    } catch {
        return [];
    }
}

function loadGameSetup() {
    const defaults = { date: localDateKey(), time: "21:00", venue: "", fee: 0, mode: "resenha" };
    try {
        const saved = JSON.parse(localStorage.getItem(GAME_SETUP_KEY) || "{}");
        return {
            date: /^\d{4}-\d{2}-\d{2}$/.test(saved.date || "") ? saved.date : defaults.date,
            time: /^\d{2}:\d{2}$/.test(saved.time || "") ? saved.time : defaults.time,
            venue: typeof saved.venue === "string" ? saved.venue.slice(0, 60) : defaults.venue,
            fee: Number.isFinite(Number(saved.fee)) ? Math.max(0, Number(saved.fee)) : defaults.fee,
            mode: defaults.mode
        };
    } catch {
        return defaults;
    }
}

function saveMatches() {
    try {
        localStorage.setItem(MATCHES_KEY, JSON.stringify(matches));
    } catch {
        showToast("Não foi possível salvar o histórico neste navegador.");
    }
}

function saveGameSetup() {
    try {
        localStorage.setItem(GAME_SETUP_KEY, JSON.stringify(gameSetup));
    } catch {
        showToast("Não foi possível salvar a configuração do jogo.");
    }
}

function loadProfessionalTeams() {
    try {
        const saved = JSON.parse(localStorage.getItem(PROFESSIONAL_TEAMS_KEY) || "[]");
        if (!Array.isArray(saved)) return [];
        return saved.filter(team => team && typeof team.id === "string" && typeof team.name === "string" && typeof team.captainId === "string" && Array.isArray(team.playerIds))
            .map(team => ({
                id: team.id,
                name: team.name.trim().slice(0, 32),
                captainId: team.captainId,
                playerIds: [...new Set(team.playerIds.filter(id => typeof id === "string"))]
            })).filter(team => team.name && team.playerIds.includes(team.captainId));
    } catch {
        return [];
    }
}

function saveProfessionalTeams() {
    try {
        localStorage.setItem(PROFESSIONAL_TEAMS_KEY, JSON.stringify(professionalTeams));
    } catch {
        showToast("Não foi possível salvar as equipes neste navegador.");
    }
}

function createId() {
    return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clampStat(value) {
    return Math.min(99, Math.max(1, Math.round(value)));
}

function statColor(value) {
    const rating = clampStat(Number(value));
    const blend = (start, end, amount) => Math.round(start + (end - start) * amount);
    let start;
    let end;
    let amount;
    if (rating < 45) {
        start = [222, 81, 71];
        end = [232, 184, 62];
        amount = (rating - 1) / 44;
    } else if (rating < 90) {
        start = [232, 184, 62];
        end = [46, 150, 88];
        amount = (rating - 45) / 44;
    } else {
        start = [30, 132, 199];
        end = [67, 195, 255];
        amount = (rating - 90) / 9;
    }
    return `rgb(${blend(start[0], end[0], amount)}, ${blend(start[1], end[1], amount)}, ${blend(start[2], end[2], amount)})`;
}

function statStyle(value) {
    const rating = clampStat(Number(value));
    return `--stat-color: ${statColor(rating)}; --stat-progress: ${(rating - 1) / 98 * 100}%`;
}

const quickProfiles = {
    geral: { label: "Geral", stats: {} },
    rapido: { label: "Rápido", stats: { acceleration: 10, sprintSpeed: 12, ballSpeed: 10, agility: 6, reactions: 4, stamina: 3 } },
    finalizador: { label: "Finalizador", stats: { attPosition: 8, finishing: 12, shotPower: 10, composure: 5, setPieces: 3 } },
    habilidoso: { label: "Habilidoso", stats: { vision: 8, shortPass: 9, longPass: 5, crossing: 5, agility: 6, balance: 4, ballControl: 10, dribblingSkill: 8 } },
    marcador: { label: "Marcador", stats: { interceptions: 8, defAware: 8, standTackle: 8, slideTackle: 6, headingAcc: 4, strength: 4 } },
    forte: { label: "Forte", stats: { strength: 10, stamina: 6, jumping: 7, headingAcc: 5, aggression: 5, sprintSpeed: 2 } },
    melhorPe: { label: "Pé fraco", weakFoot: 3, stats: { ballControl: 5, dribblingSkill: 5, shortPass: 4, balance: 4 } },
    ambidestro: { label: "Ambidestro", weakFoot: 5, stats: { vision: 4, shortPass: 5, longPass: 4, dribblingSkill: 5, ballControl: 5 } },
    goleiro: { label: "Goleiro", stats: { diving: 12, handling: 10, kicking: 7, reflexes: 12, positioning: 10, reactions: 5, jumping: 4 } },
    faltoso: { label: "Faltoso", stats: { aggression: 10, standTackle: 6, interceptions: 4, defAware: 3, strength: 4, leadership: -2 } }
};
const growthBranches = [
    { name: "Técnica", nodes: [
        { id: "touch", name: "Domínio", boosts: { ballControl: 6, dribblingSkill: 6 } },
        { id: "creation", name: "Criação", requires: "touch", boosts: { vision: 6, shortPass: 6, setPieces: 7 } }
    ] },
    { name: "Ataque", nodes: [
        { id: "finishing", name: "Finalização", boosts: { attPosition: 7, finishing: 8, shotPower: 6 } },
        { id: "weak-foot", name: "Pé fraco", requires: "finishing", boosts: { finishing: 5 }, weakFoot: 1 }
    ] },
    { name: "Defesa", nodes: [
        { id: "marking", name: "Marcação", boosts: { interceptions: 7, defAware: 7, standTackle: 6 } },
        { id: "leadership", name: "Liderança", requires: "marking", boosts: { leadership: 9, composure: 6, reactions: 4 } }
    ] },
    { name: "Goleiro", nodes: [
        { id: "keeper-reflex", name: "Reflexos", boosts: { diving: 7, reflexes: 8, positioning: 5 } },
        { id: "keeper-command", name: "Segurança", requires: "keeper-reflex", boosts: { handling: 8, kicking: 6, leadership: 4 } }
    ] }
];
const premiumNodeId = "premium-card";
const growthNodeIds = new Set([...growthBranches.flatMap(branch => branch.nodes.map(node => node.id)), premiumNodeId]);
const premiumPrerequisites = growthBranches.map(branch => branch.nodes.at(-1).id);
const players = loadPlayers();
const professionalTeams = loadProfessionalTeams();
let goalkeeperIds = new Set();
let preselectedGoalkeeperIds = new Set();

function getSelectedProfileNames() {
    const names = [...activePresets].filter(name => Object.hasOwn(quickProfiles, name));
    return names.length ? names : ["geral"];
}

function getQuickProfileLabel(profileNames) {
    const profiles = Array.isArray(profileNames) ? profileNames : [profileNames || "geral"];
    const valid = profiles.filter(name => Object.hasOwn(quickProfiles, name));
    if (!valid.length) return quickProfiles.geral.label;
    if (valid.length === 1) return quickProfiles[valid[0]].label;
    return valid.map(name => quickProfiles[name].label).join(" + ");
}

function applyQuickProfile(stats, profileNames, height = 0, weight = 0) {
    const selected = Array.isArray(profileNames) && profileNames.length ? profileNames : [profileNames || "geral"];
    const valid = selected.filter(name => Object.hasOwn(quickProfiles, name));
    const result = { ...stats };
    if (!valid.length) return result;

    valid.forEach(name => {
        const profile = quickProfiles[name] || quickProfiles.geral;
        Object.entries(profile.stats).forEach(([key, value]) => {
            if (!Object.hasOwn(result, key)) return;
            const current = Number(result[key]) || 50;
            result[key] = clampStat(current + Math.round(value * 0.45));
        });
    });

    if (height > 0) {
        result.physical = clampStat((Number(result.physical) || 50) + Math.round((height - 170) * 0.12) + 2);
        result.jumping = clampStat((Number(result.jumping) || 50) + Math.round((height - 170) * 0.14) + 2);
        result.strength = clampStat((Number(result.strength) || 50) + Math.round((height - 170) * 0.08) + 2);
    }

    if (weight > 0) {
        result.strength = clampStat((Number(result.strength) || 50) + Math.round(weight * 0.08) + 2);
        result.stamina = clampStat((Number(result.stamina) || 50) + Math.round(weight * 0.04) + 1);
    }

    return result;
}

function makePlayer(name, profileNames = getSelectedProfileNames(), height = 0, weight = 0) {
    const stats = {};
    const defaultRating = matchMode === "professional" ? 58 : 50;
    allStatGroups.forEach(group => {
        group.stats.forEach(([key]) => { stats[key] = defaultRating; });
    });
    const selection = Array.isArray(profileNames) ? profileNames : [profileNames];
    const player = {
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
    return player;
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function calculateStars(player) {
    if (matchMode === "professional" && player.premium) return 6;
    const overall = calculateOverall(player);
    return Math.max(1, Math.min(5, Math.round((1 + (overall - 1) * 4 / 98) * 2) / 2));
}

function calculateOverall(player) {
    const ratings = statGroups.flatMap(group => group.stats.map(([key]) => player.stats[key]));
    if (matchMode === "resenha") return 60;
    if (player.premium) return 96;
    const average = ratings.reduce((total, value) => total + value, 0) / ratings.length;
    return Math.min(93, Math.round(average * 0.45 + 48));
}

function ratingTier(rating) {
    if (rating >= 90) return "elite";
    if (rating >= 80) return "featured";
    if (rating >= 70) return "regular";
    return "base";
}

function categoryRating(player, group) {
    const average = group.stats.reduce((total, [key]) => total + player.stats[key], 0) / group.stats.length;
    return Math.round(average);
}

function teamOverall(team) {
    return team.length ? Math.round(team.reduce((total, player) => total + calculateOverall(player), 0) / team.length) : 0;
}

function assignDefaultTeamCaptains() {
    teamCaptainIds = teams.map(team => team[0]?.id || null);
}

function buildBalancedTeams(pool, selectedGoalkeeperIds = new Set()) {
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

function renderPlayerComparison() {
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

function formatStars(rating) {
    return Number.isInteger(rating) ? String(rating) : rating.toFixed(1).replace(".", ",");
}

function renderStarRating(rating) {
    const starCount = rating > 5 ? 6 : 5;
    const stars = Array.from({ length: starCount }, (_, index) => {
        const fill = Math.max(0, Math.min(1, rating - index));
        const state = fill === 1 ? "full" : fill === 0.5 ? "half" : "empty";
        return `<span class="rating-star ${state} ${index === 5 ? "premium-star" : ""}" aria-hidden="true">★</span>`;
    }).join("");
    return `<span class="rating-display ${starCount === 6 ? "is-premium" : ""}" aria-label="${formatStars(rating)} de ${starCount} estrelas"><span class="rating-stars" aria-hidden="true">${stars}</span><span class="rating-number">${formatStars(rating)}</span></span>`;
}

function renderOverall(player) {
    const overall = calculateOverall(player);
    return `<span class="overall-badge tier-${ratingTier(overall)} ${player.premium && matchMode === "professional" ? "premium-badge" : ""}" aria-label="Nota geral ${overall} de 99"><strong style="color: ${statColor(overall)}">${overall}</strong><small>${player.premium && matchMode === "professional" ? "PREMIUM" : "GER"}</small></span>`;
}

function renderSkillDisclosure(player, editable, expanded = false) {
    editable = editable && matchMode === "professional";
    const groups = allStatGroups.map(group => `<section class="stat-group" data-group="${group.key}">
        <div class="stat-group-heading"><span>${group.name}</span><strong style="color: ${statColor(categoryRating(player, group))}">${categoryRating(player, group)}</strong></div>
        <div class="stat-list">${group.stats.map(([key, label]) => editable
            ? `<label class="stat-row" style="${statStyle(player.stats[key])}"><span>${label}</span><input type="range" min="1" max="99" value="${player.stats[key]}" data-stat="${key}" aria-label="${label} de ${escapeHtml(player.name)}" ${player.premium ? "disabled" : ""}><output>${player.stats[key]}</output></label>`
            : `<div class="stat-row"><span>${label}</span><span class="team-stat-value" style="color: ${statColor(player.stats[key])}">${player.stats[key]}</span></div>`
        ).join("")}</div>
      </section>`).join("");
    const weakFoot = editable
        ? `<label class="weak-foot-control"><span>Pé fraco</span><input type="range" min="1" max="5" step="1" value="${player.weakFoot}" data-weak-foot aria-label="Pé fraco de ${escapeHtml(player.name)}" ${player.premium ? "disabled" : ""}><output>${player.weakFoot}/5</output></label>`
        : `<div class="weak-foot-summary"><span>Pé fraco</span><strong>${"★".repeat(player.weakFoot)}${"☆".repeat(5 - player.weakFoot)}</strong></div>`;
    const attributeCount = allStatGroups.reduce((count, group) => count + group.stats.length, 1);
    return `<details class="player-skills-disclosure" ${expanded ? "open" : ""}><summary><span>Ver habilidades</span><span class="disclosure-count">${attributeCount} atributos</span></summary><div class="disclosed-groups">${groups}<section class="stat-group weak-foot-group"><div class="stat-group-heading"><span>Técnica especial</span></div>${weakFoot}</section></div>${editable ? renderGrowthTree(player) : ""}</details>`;
}

function renderGrowthTree(player) {
    const unlocked = new Set(player.growthNodes);
    const branches = growthBranches.map(branch => `<section class="growth-branch"><h4>${branch.name}</h4><ol>${branch.nodes.map((node, index) => {
        const isUnlocked = unlocked.has(node.id);
        const prerequisiteMet = !node.requires || unlocked.has(node.requires);
        const disabled = player.premium || isUnlocked || !prerequisiteMet || player.growthPoints < 1;
        const status = isUnlocked ? "Desbloqueado" : !prerequisiteMet ? "Bloqueado" : player.growthPoints < 1 ? "Sem pontos" : "Disponível";
        return `<li class="growth-node ${isUnlocked ? "is-unlocked" : ""}"><span class="growth-node-marker">${isUnlocked ? "✓" : index + 1}</span><button type="button" data-growth-node="${node.id}" ${disabled ? "disabled" : ""}><strong>${node.name}</strong><small>${status}</small></button></li>`;
    }).join("")}</ol></section>`).join("");
    const premiumReady = premiumPrerequisites.every(node => unlocked.has(node));
    const premiumDisabled = player.premium || !premiumReady || player.growthPoints < 1;
    const premiumStatus = player.premium ? "Desbloqueado" : !premiumReady ? "Complete as quatro trilhas" : player.growthPoints < 1 ? "Sem pontos" : "Disponível";
    return `<section class="growth-tree"><div class="growth-tree-heading"><div><h3>Árvore de crescimento</h3><p>Ganhe 1 ponto ao registrar uma partida.</p></div><strong>${player.growthPoints} ${player.growthPoints === 1 ? "ponto" : "pontos"}</strong></div><div class="growth-branches">${branches}</div><div class="premium-unlock ${player.premium ? "is-unlocked" : ""}"><div><strong>Card Premium · ★6</strong><small>${premiumStatus}</small></div><button type="button" data-growth-node="${premiumNodeId}" ${premiumDisabled ? "disabled" : ""}>${player.premium ? "Premium" : "Desbloquear · 1 ponto"}</button></div></section>`;
}

function unlockGrowthNode(player, nodeId) {
    if (player.premium) return;
    if (player.growthPoints < 1) return showToast("Registre uma partida para ganhar um ponto de evolução.");
    if (nodeId === premiumNodeId) {
        if (!premiumPrerequisites.every(node => player.growthNodes.includes(node))) return showToast("Complete as quatro trilhas antes do Card Premium.");
        player.growthPoints -= 1;
        player.premium = true;
        player.weakFoot = 5;
        Object.keys(player.stats).forEach(key => { player.stats[key] = Math.max(90, player.stats[key]); });
        ["finishing", "ballControl", "vision", "reflexes", "diving", "leadership", "setPieces"].forEach(key => { player.stats[key] = 99; });
        showToast("Card Premium desbloqueado: overall 96 e sexta estrela!");
    } else {
        const node = growthBranches.flatMap(branch => branch.nodes).find(item => item.id === nodeId);
        if (!node || player.growthNodes.includes(node.id)) return;
        if (node.requires && !player.growthNodes.includes(node.requires)) return showToast("Desbloqueie o passo anterior desta trilha primeiro.");
        player.growthPoints -= 1;
        player.growthNodes.push(node.id);
        Object.entries(node.boosts).forEach(([key, value]) => {
            player.stats[key] = clampStat((Number(player.stats[key]) || 50) + value);
        });
        if (node.weakFoot) player.weakFoot = Math.min(5, player.weakFoot + node.weakFoot);
        showToast(`${node.name} evoluiu. Continue a trilha para crescer.`);
    }
    savePlayers();
    renderRoster();
    renderTeams();
    renderEvolution();
}

function showToast(message) {
    const toast = document.querySelector("#toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function formatCurrency(value) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
}

function formatMatchDate(value) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${value}T12:00:00`));
}

function getRankingEntries(period) {
    const today = localDateKey();
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

function renderRankingTable(entries) {
    if (!entries.length) return `<div class="data-empty"><span class="ranking-empty-ball" aria-hidden="true">${renderPitchBall("ranking-empty-shell")}</span><p>Nenhum gol ou assistência registrado neste período.</p></div>`;
    return `<div class="table-scroll"><table class="ranking-table"><thead><tr><th>#</th><th>Jogador</th><th>Jogos</th><th>Gols</th><th>Assist.</th></tr></thead><tbody>${entries.map((entry, index) => `<tr><td><span class="ranking-position ${index < 3 ? `position-${index + 1}` : ""}">${String(index + 1).padStart(2, "0")}</span></td><th scope="row">${escapeHtml(entry.name)}</th><td>${entry.games}</td><td class="ranking-goals">${entry.goals}</td><td>${entry.assists}</td></tr>`).join("")}</tbody></table></div>`;
}

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
    const historyList = document.querySelector("#history-list");
    const orderedMatches = [...matches].sort((first, second) => `${second.date}${second.time || ""}`.localeCompare(`${first.date}${first.time || ""}`));
    historyList.innerHTML = orderedMatches.length ? orderedMatches.map(match => renderRecentMatch(match)).join("") : '<div class="data-empty"><span aria-hidden="true">◷</span><p>As partidas registradas vão aparecer aqui.</p></div>';
}

function renderRankings() {
    const button = document.querySelector(`[data-ranking-period="${rankingPeriod}"]`);
    document.querySelectorAll("[data-ranking-period]").forEach(option => option.setAttribute("aria-pressed", String(option === button)));
    document.querySelector("#ranking-list").innerHTML = renderRankingTable(getRankingEntries(rankingPeriod));
}

function renderPayments() {
    document.querySelector("#reset-payments").disabled = matches.length === 0;
    document.querySelector("#pay-all").disabled = matches.length === 0;
    const pendingCount = matches.reduce((total, match) => total + match.participants.filter(participant => !match.payments[participant.id]).length, 0);
    const paidTotal = matches.reduce((total, match) => total + match.participants.filter(participant => match.payments[participant.id]).length * (Number(match.fee) || 0), 0);
    document.querySelector("#payments-summary").innerHTML = `<article><span>Em aberto</span><strong>${pendingCount} ${pendingCount === 1 ? "pagamento" : "pagamentos"}</strong></article><article><span>Recebido</span><strong>${formatCurrency(paidTotal)}</strong></article>`;
    const paymentsList = document.querySelector("#payments-list");
    if (!matches.length) {
        paymentsList.innerHTML = '<div class="data-empty"><span aria-hidden="true">R$</span><p>Registre uma partida para acompanhar os pagamentos.</p></div>';
        return;
    }
    const orderedMatches = [...matches].sort((first, second) => `${second.date}${second.time || ""}`.localeCompare(`${first.date}${first.time || ""}`));
    paymentsList.innerHTML = orderedMatches.map(match => {
        const paidCount = match.participants.filter(participant => match.payments[participant.id]).length;
        return `<section class="payment-match">
            <header class="payment-match-head"><div><p class="eyebrow">${formatMatchDate(match.date)}${match.time ? ` · ${escapeHtml(match.time)}` : ""}</p><h2>${match.venue ? escapeHtml(match.venue) : "Jogo do racha"}</h2></div><div class="payment-progress"><strong>${paidCount}/${match.participants.length}</strong><span>pagos</span><b>${formatCurrency(match.fee)} / jogador</b></div></header>
            <div class="payment-players">${match.participants.map(participant => {
                const paid = Boolean(match.payments[participant.id]);
                const teamName = participant.team === 0 ? "Time A" : "Time B";
                return `<div class="payment-player"><div><strong>${escapeHtml(participant.name)}</strong><span>${teamName}</span></div><strong class="payment-amount">${formatCurrency(match.fee)}</strong><button class="payment-toggle ${paid ? "is-paid" : ""}" type="button" data-payment-match="${escapeHtml(match.id)}" data-payment-player="${escapeHtml(participant.id)}" aria-pressed="${paid}">${paid ? "✓ Pago" : "Marcar pago"}</button></div>`;
            }).join("")}</div>
          </section>`;
    }).join("");
}

function renderHome() {
    const today = localDateKey();
    const month = today.slice(0, 7);
    const monthlyMatches = matches.filter(match => match.date.startsWith(month));
    const pendingCount = matches.reduce((total, match) => total + match.participants.filter(participant => !match.payments[participant.id]).length, 0);
    document.querySelector("#home-player-count").textContent = players.length;
    document.querySelector("#home-match-count").textContent = monthlyMatches.length;
    document.querySelector("#home-pending-count").textContent = pendingCount;
    const leaders = getRankingEntries("day").filter(entry => entry.goals || entry.assists).slice(0, 3);
    document.querySelector("#home-today-leaders").innerHTML = leaders.length ? leaders.map((entry, index) => `<div class="home-leader"><span class="home-leader-rank">${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(entry.name)}</strong><span>${entry.goals} G · ${entry.assists} A</span></div>`).join("") : '<p class="home-empty-note">Os destaques aparecem depois de registrar uma partida.</p>';
    const recentMatches = [...matches].sort((first, second) => `${second.date}${second.time || ""}`.localeCompare(`${first.date}${first.time || ""}`)).slice(0, 3);
    document.querySelector("#home-recent-games").innerHTML = recentMatches.length ? recentMatches.map(match => renderRecentMatch(match, true)).join("") : '<p class="home-empty-note">Nenhum jogo registrado ainda.</p>';
}

function renderMatchRecording() {
    if (!teams) {
        recordingArea.innerHTML = "";
        return;
    }
    if (activeMatchId) {
        const savedMatch = matches.find(match => match.id === activeMatchId);
        if (savedMatch) {
            recordingArea.innerHTML = `<section class="match-saved"><span class="saved-mark" aria-hidden="true">✓</span><div><strong>Resultado salvo</strong><p>${savedMatch.score[0]} × ${savedMatch.score[1]} · disponível no histórico</p></div><button class="text-action" type="button" data-view-target="history">Abrir histórico →</button></section>`;
            return;
        }
    }

    recordingArea.innerHTML = `<form class="result-entry" id="match-result-form">
        <header class="result-entry-head"><div><p class="eyebrow">Fim de jogo</p><h2>Registrar resultado</h2><p>Informe gols e assistências de cada jogador.</p></div><div class="live-score"><span data-result-score="0">0</span><b>×</b><span data-result-score="1">0</span></div></header>
        <div class="result-team-grid">${teams.map((team, teamIndex) => `<section class="result-team-entry result-team-entry-${teamIndex === 0 ? "a" : "b"}" data-result-team="${teamIndex}">
            <h3>Time ${teamIndex === 0 ? "A" : "B"}<span data-team-result-label>${team.length} ${team.length === 1 ? "jogador" : "jogadores"}</span></h3>
            <div class="result-player-list">${team.map(player => `<div class="result-player-row"><strong>${escapeHtml(player.name)}</strong><label><span>Gols</span><input type="number" min="0" max="99" step="1" value="0" inputmode="numeric" data-result-stat="goals" data-player-id="${escapeHtml(player.id)}" data-result-team="${teamIndex}" aria-label="Gols de ${escapeHtml(player.name)}"></label><label><span>Assist.</span><input type="number" min="0" max="99" step="1" value="0" inputmode="numeric" data-result-stat="assists" data-player-id="${escapeHtml(player.id)}" aria-label="Assistências de ${escapeHtml(player.name)}"></label></div>`).join("")}</div>
          </section>`).join("")}</div>
        <footer class="result-entry-footer"><span>Ao salvar, os pagamentos desta partida começam como pendentes.</span><button class="primary" type="submit">Salvar jogo e estatísticas</button></footer>
      </form>`;
    updateLiveScore();
}

function updateLiveScore() {
    if (!recordingArea) return;
    const scores = [0, 0];
    recordingArea.querySelectorAll('[data-result-stat="goals"]').forEach(input => {
        scores[Number(input.dataset.resultTeam)] += Math.max(0, Number(input.value) || 0);
    });
    recordingArea.querySelectorAll("[data-result-score]").forEach(score => {
        score.textContent = scores[Number(score.dataset.resultScore)];
    });
}

function saveMatchResult() {
    if (!teams || activeMatchId) return;
    const participants = teams.flatMap((team, teamIndex) => team.map(player => ({ id: player.id, name: player.name, team: teamIndex })));
    const stats = Object.fromEntries(participants.map(participant => {
        const goalsInput = recordingArea.querySelector(`[data-result-stat="goals"][data-player-id="${CSS.escape(participant.id)}"]`);
        const assistsInput = recordingArea.querySelector(`[data-result-stat="assists"][data-player-id="${CSS.escape(participant.id)}"]`);
        return [participant.id, { goals: Math.max(0, Number(goalsInput?.value) || 0), assists: Math.max(0, Number(assistsInput?.value) || 0) }];
    }));
    const score = teams.map(team => team.reduce((total, player) => total + stats[player.id].goals, 0));
    const setup = activeMatchSetup || gameSetup;
    const match = {
        id: createId(),
        date: setup.date,
        time: setup.time,
        venue: setup.venue,
        fee: setup.fee,
        mode: setup.mode || matchMode,
        teamCaptains: [...teamCaptainIds],
        teams: teams.map(team => team.map(player => player.id)),
        participants,
        stats,
        score,
        payments: Object.fromEntries(participants.map(participant => [participant.id, false]))
    };
    matches.unshift(match);
    participants.forEach(participant => {
        const player = players.find(item => item.id === participant.id);
        if (player) player.growthPoints += 1;
    });
    activeMatchId = match.id;
    drawButton.disabled = true;
    document.querySelector("#clear-teams").disabled = true;
    teamsArea.querySelectorAll("[data-team-captain]").forEach(select => { select.disabled = true; });
    saveMatches();
    savePlayers();
    renderRoster();
    renderMatchRecording();
    renderHome();
    renderHistory();
    renderRankings();
    renderPayments();
    showToast("Jogo salvo no histórico.");
}

function showAppView(viewName) {
    const view = document.querySelector(`#${viewName}-view`);
    if (!view) return;
    document.querySelectorAll(".app-view").forEach(section => section.classList.toggle("is-active", section === view));
    document.querySelectorAll(".nav-item").forEach(button => {
        if (button.dataset.viewTarget === viewName) button.setAttribute("aria-current", "page");
        else button.removeAttribute("aria-current");
    });
    if (viewName === "professional") {
        matchMode = "professional";
        showProfessionalTab(activeProfessionalTab);
    }
    else if (viewName === "match") {
        matchMode = "resenha";
        syncPlayerCreationControls();
        renderRoster();
        renderTeams();
    }
    if (viewName === "match" && !activeMatchSetup) activeMatchSetup = { ...gameSetup };
    if (viewName === "home") renderHome();
    if (viewName === "history") renderHistory();
    if (viewName === "payments") renderPayments();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function showProfessionalTab(tabName) {
    const tab = ["teams", "evolution", "ranking"].includes(tabName) ? tabName : "teams";
    activeProfessionalTab = tab;
    document.querySelectorAll(".professional-tabs [data-professional-tab-target]").forEach(button => {
        const selected = button.dataset.professionalTabTarget === tab;
        button.setAttribute("aria-selected", String(selected));
        button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll(".professional-tab-panel").forEach(panel => {
        panel.hidden = panel.id !== `professional-${tab}-panel`;
    });
    matchMode = "professional";
    if (tab === "teams") renderProfessionalTeams();
    if (tab === "evolution") renderEvolution();
    if (tab === "ranking") renderRankings();
}

function readGameSetup() {
    gameSetup = {
        date: document.querySelector("#game-date").value,
        time: document.querySelector("#game-time").value,
        venue: document.querySelector("#game-venue").value.trim(),
        fee: Math.max(0, Number(document.querySelector("#game-fee").value) || 0),
        mode: "resenha"
    };
    saveGameSetup();
}

function renderProfessionalTeams() {
    const captainSelect = document.querySelector("#professional-team-captain");
    const teamList = document.querySelector("#professional-team-list");
    if (!captainSelect || !teamList) return;
    const assignedPlayerIds = new Set(professionalTeams.flatMap(team => team.playerIds));
    const availableCaptains = players.filter(player => !assignedPlayerIds.has(player.id));
    captainSelect.innerHTML = `<option value="">Selecione um jogador</option>${availableCaptains.map(player => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join("")}`;
    document.querySelector("#professional-team-form button[type='submit']").disabled = availableCaptains.length === 0;

    if (!professionalTeams.length) {
        teamList.innerHTML = '<div class="data-empty"><span aria-hidden="true">♜</span><p>Crie a primeira equipe e escolha seu capitão.</p></div>';
        return;
    }
    teamList.innerHTML = professionalTeams.map(team => {
        const roster = team.playerIds.map(id => players.find(player => player.id === id)).filter(Boolean);
        const captains = roster.map(player => `<option value="${escapeHtml(player.id)}" ${player.id === team.captainId ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("");
        const assignedElsewhere = new Set(professionalTeams.filter(other => other.id !== team.id).flatMap(other => other.playerIds));
        const availablePlayers = players.filter(player => !assignedElsewhere.has(player.id) && !team.playerIds.includes(player.id));
        return `<article class="professional-team" data-professional-team="${escapeHtml(team.id)}">
            <header class="professional-team-head"><div><p class="eyebrow">Equipe de demonstração</p><h2>${escapeHtml(team.name)}</h2></div><button class="secondary-action" type="button" data-team-delete="${escapeHtml(team.id)}" aria-label="Excluir equipe ${escapeHtml(team.name)}">Excluir equipe</button></header>
            <div class="professional-team-meta"><label>Capitão<select data-team-captain="${escapeHtml(team.id)}" ${roster.length < 2 ? "disabled" : ""}>${captains}</select></label><strong>${roster.length} ${roster.length === 1 ? "jogador" : "jogadores"}</strong></div>
            <form class="professional-add-player" data-team-add-form="${escapeHtml(team.id)}"><label>Adicionar jogador<select name="playerId" required ${availablePlayers.length ? "" : "disabled"}><option value="">${availablePlayers.length ? "Selecione um jogador disponível" : "Todos os jogadores já estão em equipes"}</option>${availablePlayers.map(player => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join("")}</select></label><button class="primary" type="submit" ${availablePlayers.length ? "" : "disabled"}>Adicionar</button></form>
            <ul class="professional-roster">${roster.map(player => `<li><span><strong>${escapeHtml(player.name)}</strong>${player.id === team.captainId ? '<small>CAPITÃO</small>' : ""}</span><button class="icon-btn remove" type="button" data-team-remove-player="${escapeHtml(team.id)}" data-player-id="${escapeHtml(player.id)}" aria-label="Remover ${escapeHtml(player.name)} da equipe">×</button></li>`).join("") || '<li class="professional-roster-empty">Sem jogadores vinculados.</li>'}</ul>
        </article>`;
    }).join("");
}

function removePlayerFromProfessionalTeams(playerId) {
    professionalTeams.forEach(team => {
        team.playerIds = team.playerIds.filter(id => id !== playerId);
        if (team.captainId === playerId) team.captainId = team.playerIds[0] || "";
    });
    for (let index = professionalTeams.length - 1; index >= 0; index -= 1) {
        if (!professionalTeams[index].playerIds.length) professionalTeams.splice(index, 1);
    }
    saveProfessionalTeams();
    renderProfessionalTeams();
}

function createProfessionalTeam(event) {
    event.preventDefault();
    const nameInput = document.querySelector("#professional-team-name");
    const captainSelect = document.querySelector("#professional-team-captain");
    const name = nameInput.value.trim().replace(/\s+/g, " ").slice(0, 32);
    const captainId = captainSelect.value;
    if (!name || !players.some(player => player.id === captainId)) return showToast("Escolha um capitão disponível para criar a equipe.");
    if (professionalTeams.some(team => team.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return showToast("Já existe uma equipe com esse nome.");
    if (professionalTeams.some(team => team.playerIds.includes(captainId))) return showToast("Este jogador já participa de outra equipe.");
    professionalTeams.push({ id: createId(), name, captainId, playerIds: [captainId] });
    saveProfessionalTeams();
    nameInput.value = "";
    renderProfessionalTeams();
    showToast(`${name} criada. ${players.find(player => player.id === captainId).name} é o capitão.`);
}

function handleProfessionalTeamAction(event) {
    const deleteButton = event.target.closest("[data-team-delete]");
    if (deleteButton) {
        const index = professionalTeams.findIndex(team => team.id === deleteButton.dataset.teamDelete);
        if (index < 0) return;
        professionalTeams.splice(index, 1);
        saveProfessionalTeams();
        renderProfessionalTeams();
        return;
    }
    const removeButton = event.target.closest("[data-team-remove-player]");
    if (removeButton) {
        const team = professionalTeams.find(item => item.id === removeButton.dataset.teamRemovePlayer);
        if (!team || team.playerIds.length <= 1) return showToast("A equipe precisa manter ao menos um jogador. Exclua a equipe para removê-la por completo.");
        const playerId = removeButton.dataset.playerId;
        team.playerIds = team.playerIds.filter(id => id !== playerId);
        if (team.captainId === playerId) team.captainId = team.playerIds[0];
        saveProfessionalTeams();
        renderProfessionalTeams();
    }
}

function handleProfessionalTeamChange(event) {
    const captainSelect = event.target.closest("[data-team-captain]");
    if (!captainSelect) return;
    const team = professionalTeams.find(item => item.id === captainSelect.dataset.teamCaptain);
    if (!team || !team.playerIds.includes(captainSelect.value)) return;
    team.captainId = captainSelect.value;
    saveProfessionalTeams();
    renderProfessionalTeams();
}

function addProfessionalTeamPlayer(event) {
    const form = event.target.closest("[data-team-add-form]");
    if (!form) return;
    event.preventDefault();
    const team = professionalTeams.find(item => item.id === form.dataset.teamAddForm);
    const playerId = new FormData(form).get("playerId");
    if (!team || !players.some(player => player.id === playerId)) return;
    if (professionalTeams.some(other => other.playerIds.includes(playerId))) return showToast("Este jogador já participa de uma equipe.");
    team.playerIds.push(playerId);
    saveProfessionalTeams();
    renderProfessionalTeams();
}

function renderMatchDetails() {
    const setup = activeMatchSetup || gameSetup;
    return `<section class="match-details" aria-label="Dados da partida">
        <div><span>DATA E HORÁRIO</span><strong>${formatMatchDate(setup.date)} · ${escapeHtml(setup.time || "Horário a definir")}</strong><small>${escapeHtml(setup.venue || "Local a definir")}</small></div>
    </section>`;
}

function startNewMatch() {
    readGameSetup();
    activeMatchSetup = { ...gameSetup };
    activeMatchId = null;
    teams = null;
    teamCaptainIds = [null, null];
    goalkeeperIds.clear();
    selectedPlayerId = null;
    comparisonPlayerIds = null;
    selectionMode = "swap";
    drawButton.disabled = players.length < 2 || Boolean(activeMatchId);
    renderTeams();
    showAppView("match");
    if (players.length < 2) showToast("Cadastre pelo menos dois jogadores para sortear os times.");
}

function initializeDashboard() {
    document.querySelector("#session-ball").innerHTML = renderPitchBall("session-ball-shell");
    document.querySelectorAll("[data-ball-icon]").forEach(element => { element.innerHTML = renderPitchBall(`nav-ball-${element.parentElement.dataset.viewTarget}`); });
    document.querySelector("#game-date").value = gameSetup.date;
    document.querySelector("#game-time").value = gameSetup.time;
    document.querySelector("#game-venue").value = gameSetup.venue;
    document.querySelector("#game-fee").value = gameSetup.fee || "";
    document.querySelectorAll(".match-mode-button").forEach(button => {
        button.setAttribute("aria-pressed", String(button.dataset.matchMode === "resenha"));
    });
    document.querySelector("#match-mode-description").textContent = "Monte as equipes e organize a partida entre amigos.";
    syncPlayerCreationControls();
    document.querySelector(".professional-tabs").addEventListener("keydown", event => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const tabs = [...document.querySelectorAll(".professional-tabs [data-professional-tab-target]")];
        const currentIndex = tabs.indexOf(event.target.closest("[data-professional-tab-target]"));
        if (currentIndex < 0) return;
        event.preventDefault();
        const direction = event.key === "ArrowRight" ? 1 : -1;
        const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
        showProfessionalTab(nextTab.dataset.professionalTabTarget);
        nextTab.focus();
    });
    document.addEventListener("click", event => {
        const professionalTabButton = event.target.closest("[data-professional-tab-target]");
        if (professionalTabButton) {
            if (!document.querySelector("#professional-view").classList.contains("is-active")) showAppView("professional");
            showProfessionalTab(professionalTabButton.dataset.professionalTabTarget);
            return;
        }
        const viewButton = event.target.closest("[data-view-target]");
        if (viewButton) showAppView(viewButton.dataset.viewTarget);
    });
    document.querySelector("#setup-form").addEventListener("input", readGameSetup);
    document.querySelector("#setup-form").addEventListener("change", readGameSetup);
    document.querySelector("#professional-team-form").addEventListener("submit", createProfessionalTeam);
    document.querySelector("#professional-team-list").addEventListener("click", handleProfessionalTeamAction);
    document.querySelector("#professional-team-list").addEventListener("change", handleProfessionalTeamChange);
    document.querySelector("#professional-team-list").addEventListener("submit", addProfessionalTeamPlayer);
    document.querySelector("#setup-form").addEventListener("submit", event => {
        event.preventDefault();
        startNewMatch();
    });
    document.querySelector("#clear-players").addEventListener("click", () => {
        if (!players.length) return showToast("A lista de jogadores já está vazia.");
        if (!window.confirm("Apagar todos os jogadores cadastrados? O histórico de partidas e pagamentos será mantido.")) return;
        players.length = 0;
        preselectedGoalkeeperIds.clear();
        professionalTeams.length = 0;
        saveProfessionalTeams();
        teams = null;
        teamCaptainIds = [null, null];
        goalkeeperIds.clear();
        activeMatchId = null;
        activeMatchSetup = { ...gameSetup };
        selectedPlayerId = null;
        comparisonPlayerIds = null;
        savePlayers();
        renderRoster();
        renderTeams();
        renderHome();
        renderProfessionalTeams();
        showToast("Jogadores removidos. O histórico foi mantido.");
    });
    document.querySelector("#clear-teams").addEventListener("click", () => {
        if (!teams || activeMatchId) return;
        teams = null;
        teamCaptainIds = [null, null];
        goalkeeperIds.clear();
        selectedPlayerId = null;
        comparisonPlayerIds = null;
        selectionMode = "swap";
        renderTeams();
        renderRoster();
        showToast("Escalação limpa. Os jogadores continuam na lista.");
    });
    document.querySelector("#pay-all").addEventListener("click", () => setAllPayments(true));
    document.querySelector("#reset-payments").addEventListener("click", () => setAllPayments(false));
    document.querySelectorAll("[data-ranking-period]").forEach(button => button.addEventListener("click", () => {
        rankingPeriod = button.dataset.rankingPeriod;
        renderRankings();
    }));
    document.querySelector("#payments-list").addEventListener("click", event => {
        const button = event.target.closest("[data-payment-match]");
        if (!button) return;
        const match = matches.find(item => item.id === button.dataset.paymentMatch);
        if (!match || !Object.hasOwn(match.payments, button.dataset.paymentPlayer)) return;
        match.payments[button.dataset.paymentPlayer] = !match.payments[button.dataset.paymentPlayer];
        saveMatches();
        renderPayments();
        renderHome();
    });
    recordingArea.addEventListener("input", event => {
        if (event.target.matches("[data-result-stat='goals']")) updateLiveScore();
    });
    recordingArea.addEventListener("submit", event => {
        if (event.target.id !== "match-result-form") return;
        event.preventDefault();
        saveMatchResult();
    });
}

function syncPlayerCreationControls() {
    const isResenha = matchMode === "resenha";
    document.querySelector(".player-mode-toggle").hidden = isResenha;
    document.querySelector("#quick-preset-row").hidden = isResenha || playerCreationMode !== "quick";
    document.querySelector(".measure-row").hidden = isResenha;
    document.querySelector("#player-input").setAttribute("placeholder", isResenha || playerCreationMode === "quick" ? "Nome do jogador" : "Digite o nome e ajuste depois");
}

function setAllPayments(paid) {
    const action = paid ? "marcar todos os pagamentos como pagos" : "zerar os pagamentos e deixá-los pendentes";
    if (!window.confirm(`Deseja ${action} em todas as partidas?`)) return;
    matches.forEach(match => {
        match.participants.forEach(participant => {
            match.payments[participant.id] = paid;
        });
    });
    saveMatches();
    renderPayments();
    renderHome();
    showToast(paid ? "Todos os pagamentos foram marcados como pagos." : "Todos os pagamentos foram zerados.");
}

function invalidateTeams() {
    teams = null;
    teamCaptainIds = [null, null];
    goalkeeperIds.clear();
    selectedPlayerId = null;
    comparisonPlayerIds = null;
    selectionMode = "swap";
    renderTeams();
}

function renderRoster() {
    renderProfessionalTeams();
    document.querySelector("#roster-count").textContent = players.length;
    document.querySelector("#summary-count").textContent = `${players.length} ${players.length === 1 ? "jogador" : "jogadores"}`;
    document.querySelector("#goalkeeper-selection-note").textContent = teams
        ? `Goleiros desta escalação: ${goalkeeperIds.size} definidos. Limpe os times para alterar antes de outro sorteio.`
        : `Goleiros opcionais para este sorteio: ${preselectedGoalkeeperIds.size} selecionados.`;
    drawButton.disabled = players.length < 2;
    if (players.length === 0) {
        rosterElement.innerHTML = '<div class="empty-roster">Sua lista começa com o primeiro nome.<br>Cadastre pelo menos 2 jogadores para sortear.</div>';
        return;
    }
    rosterElement.innerHTML = players.map(player => {
        const stars = calculateStars(player);
        const tier = ratingTier(calculateOverall(player));
        const quickLabel = getQuickProfileLabel(player.quickProfile || ["geral"]);
        return `
            <article class="player-card tier-${tier}" data-id="${player.id}">
                <div class="player-top"><span class="player-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span><span class="player-actions">${renderStarRating(stars)}${renderOverall(player)}<button class="icon-btn edit" type="button" aria-label="Editar nome de ${escapeHtml(player.name)}" title="Editar nome">✎</button><button class="icon-btn remove" type="button" aria-label="Remover ${escapeHtml(player.name)}" title="Remover jogador">×</button></span></div>
                <div class="quick-profile-pill">${escapeHtml(quickLabel)}${matchMode === "professional" ? ` · Pé fraco ${player.weakFoot}/5` : ""}</div>
                <button class="goalkeeper-roster-toggle ${preselectedGoalkeeperIds.has(player.id) ? "is-selected" : ""}" type="button" data-goalkeeper-preselect="${escapeHtml(player.id)}" aria-pressed="${preselectedGoalkeeperIds.has(player.id)}" ${teams ? "disabled" : ""}>${preselectedGoalkeeperIds.has(player.id) ? "✓ Goleiro selecionado" : "＋ Definir como goleiro"}</button>
      </article>`;
    }).join("");
}

function renderEvolution() {
    if (matchMode !== "professional") {
        evolutionRosterElement.innerHTML = '<div class="evolution-empty"><h2>Evolução profissional</h2><p>Acesse o Racha Profissional para editar atributos e acompanhar as trilhas de evolução.</p><button class="primary" type="button" data-view-target="professional">Abrir Racha Profissional</button></div>';
        return;
    }
    if (!players.length) {
        evolutionRosterElement.innerHTML = '<div class="evolution-empty"><h2>Comece pela escalação</h2><p>Cadastre os jogadores na montagem para abrir suas habilidades e trilhas de evolução.</p><button class="primary" type="button" data-view-target="match">Ir para montagem</button></div>';
        return;
    }
    evolutionRosterElement.innerHTML = players.map(player => `
        <article class="player-card evolution-player-card tier-${ratingTier(calculateOverall(player))}" data-id="${player.id}">
            <div class="player-top"><span class="player-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span><span class="player-actions">${renderStarRating(calculateStars(player))}${renderOverall(player)}</span></div>
            <div class="quick-profile-pill">${escapeHtml(getQuickProfileLabel(player.quickProfile || ["geral"]))} · Pé fraco ${player.weakFoot}/5</div>
            ${renderSkillDisclosure(player, true, true)}
        </article>`).join("");
}

function renderPitchBall(gradientId = "pitch-ball-shell") {
    return `<svg class="pitch-ball-icon" viewBox="0 0 100 100" focusable="false"><defs><radialGradient id="${gradientId}" cx="34%" cy="27%" r="76%"><stop offset="0" stop-color="#fff"/><stop offset=".72" stop-color="#f0f2ee"/><stop offset="1" stop-color="#c6ccc5"/></radialGradient></defs><circle cx="50" cy="50" r="43" fill="url(#${gradientId})" stroke="#d7ded7" stroke-width="2.5"/><path d="m50 32 16 12-6 19H40l-6-19z" fill="#18201a" stroke="#18201a" stroke-linejoin="round"/><path d="M50 32 49 8M66 44l22-8M60 63l14 20M40 63 26 83M34 44l-22-8M49 8l-17 3-10 8 4 15 18-2M88 36l-3-15-11-9-16-4-9 24M74 83l15-8 7-13-2-16-18-2-10 19M26 83l-14-8-7-13 2-16 18-2 15 19M12 36l-2-15 11-9 11-1M50 92l-15-3-9-6M50 92l15-3 9-6" fill="none" stroke="#344039" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"/><path d="m49 32 1-24m16 36 22-8m-28 27 14 20M40 63 26 83M34 44l-22-8" fill="none" stroke="#aab3ab" stroke-linecap="round" stroke-width="1.8"/></svg>`;
}

function renderTeams() {
    document.querySelector("#clear-teams").disabled = !teams || Boolean(activeMatchId);
    if (!teams) {
        teamsArea.innerHTML = `${renderMatchDetails()}<div class="team-empty"><span class="pitch-icon" aria-hidden="true"><img class="pitch-logo" src="racha-escudo.svg" alt=""></span><p>Adicione os jogadores e sorteie os times para ver as escalações.</p></div>`;
        document.querySelector("#team-description").textContent = players.length > 0 ? "Sorteie novamente para montar as equipes." : "Seu próximo sorteio aparece aqui.";
        renderMatchRecording();
        return;
    }
    const teamTotal = teams[0].length + teams[1].length;
    const teamRatings = teams.map(teamOverall);
    const ratingDifference = Math.abs(teamRatings[0] - teamRatings[1]);
    const balanceLabel = ratingDifference <= 3 ? "Times muito equilibrados" : ratingDifference <= 8 ? "Diferença moderada" : `${ratingDifference} pontos de diferença`;
    const balancePercent = Math.round(Math.min(teamRatings[0], teamRatings[1]) / Math.max(teamRatings[0], teamRatings[1], 1) * 100);
    const compareContent = renderPlayerComparison();
    const selectionHint = selectionMode === "compare"
        ? selectedPlayerId ? "Agora escolha outro jogador para comparar." : comparisonPlayerIds ? "Escolha outra dupla ou troque de modo." : "Escolha dois jogadores de qualquer time."
        : selectedPlayerId ? "Agora escolha alguém do outro time para concluir a troca." : "Selecione um jogador de cada time para trocar.";
    document.querySelector("#team-description").textContent = `${teamTotal} jogadores distribuídos, sem deixar ninguém de fora.`;
    teamsArea.innerHTML = `${renderMatchDetails()}<section class="match-summary" aria-label="Resumo do confronto">
        <div class="match-summary-heading"><span><i aria-hidden="true"></i> Escalação definida</span><strong>${teamTotal} jogadores</strong></div>
        <div class="match-result" aria-label="Nota geral: Time A ${teamRatings[0]}, Time B ${teamRatings[1]}">
            <div class="result-team result-a"><span>Time A</span><strong>${teamRatings[0]}<small>GER</small></strong></div>
            <span class="result-vs" aria-hidden="true">VS</span>
            <div class="result-team result-b"><span>Time B</span><strong>${teamRatings[1]}<small>GER</small></strong></div>
        </div>
        <div class="balance-status"><div class="balance-track" role="img" aria-label="${balanceLabel}"><span style="--balance-fill: ${balancePercent}%"></span></div><strong>${balanceLabel}</strong></div>
        <button class="secondary-action match-balance-button" type="button" id="balance-teams">✨ Equilibrar times</button>
        </section><div class="team-interactions" role="group" aria-label="Ações entre jogadores">
                <button class="interaction-choice" type="button" data-selection-mode="swap" aria-pressed="${selectionMode === "swap"}">↔ <span>Trocar jogadores</span></button>
                <button class="interaction-choice" type="button" data-selection-mode="compare" aria-pressed="${selectionMode === "compare"}">⇄ <span>Comparar jogadores</span></button>
        </div>${compareContent}<div class="teams">${teams.map((team, teamIndex) => {
        return `
      <section class="team team-${teamIndex === 0 ? "a" : "b"}" aria-label="Time ${teamIndex === 0 ? "A" : "B"}">
        <div class="team-title"><h3><span class="team-dot"></span>Time ${teamIndex === 0 ? "A" : "B"}</h3><div class="team-meta"><span>${team.length} ${team.length === 1 ? "jogador" : "jogadores"}</span><strong>${teamRatings[teamIndex]} GER</strong><label class="team-captain-control"><span>Capitão</span><select data-team-captain="${teamIndex}" aria-label="Capitão do Time ${teamIndex === 0 ? "A" : "B"}" ${activeMatchId ? "disabled" : ""}>${team.map(teamPlayer => `<option value="${escapeHtml(teamPlayer.id)}" ${teamPlayer.id === teamCaptainIds[teamIndex] ? "selected" : ""}>${escapeHtml(teamPlayer.name)}</option>`).join("")}</select></label></div></div>
        <div class="team-players">${team.map((player, playerIndex) => {
                        const actionLabel = selectionMode === "compare" ? `Selecionar ${player.name} para comparação` : selectedPlayerId ? `Trocar ${player.name} de time` : `Selecionar ${player.name} para troca`;
                        const isGoalkeeper = goalkeeperIds.has(player.id);
                        const roleLabel = player.id === teamCaptainIds[teamIndex] ? "CAPITÃO" : "";
                        return `<article class="team-player tier-${ratingTier(calculateOverall(player))} ${isGoalkeeper ? "goalkeeper-card" : ""} ${selectedPlayerId === player.id ? "selected" : ""} ${selectedPlayerId ? "selectable" : ""}" style="--player-index: ${playerIndex}" data-id="${player.id}" data-team="${teamIndex}" role="group" tabindex="0" aria-label="${escapeHtml(actionLabel)}${isGoalkeeper ? ", goleiro" : ""}${roleLabel ? `, ${roleLabel.toLocaleLowerCase("pt-BR")}` : ""}">
                            <div class="player-top"><span class="team-player-identity"><span class="player-name">${escapeHtml(player.name)}</span>${roleLabel ? `<span class="player-role-badge">${roleLabel}</span>` : ""}${isGoalkeeper ? '<span class="goalkeeper-badge">GOLEIRO</span>' : ""}</span><span class="team-player-rating">${renderStarRating(calculateStars(player))}${renderOverall(player)}</span></div>
                <div class="quick-profile-pill team-specialties">${escapeHtml(getQuickProfileLabel(player.quickProfile || ["geral"]))}${matchMode === "professional" ? ` · Pé fraco ${player.weakFoot}/5` : ""}</div>
          </article>`;
        }).join("")}</div>
            </section>`;
        }).join("")}</div><p class="swap-hint">${selectionHint}</p>`;
    renderMatchRecording();
}

function addPlayer(name) {
    const cleanName = name.trim().replace(/\s+/g, " ");
    if (!cleanName) return false;
    if (players.some(player => player.name.toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR"))) {
        showToast(`${cleanName} já está na lista.`);
        return false;
    }
    const heightValue = matchMode === "professional" ? Number(document.querySelector("#player-height")?.value || 0) : 0;
    const weightValue = matchMode === "professional" ? Number(document.querySelector("#player-weight")?.value || 0) : 0;
    const selectedProfiles = matchMode === "professional" ? getSelectedProfileNames() : ["geral"];
    players.push(makePlayer(cleanName, selectedProfiles, heightValue, weightValue));
    return true;
}

document.querySelector("#add-form").addEventListener("submit", event => {
    event.preventDefault();
    const input = document.querySelector("#player-input");
    if (addPlayer(input.value)) {
        input.value = "";
        savePlayers();
        renderRoster();
        invalidateTeams();
        showToast("Jogador adicionado. Sorteie para atualizar os times.");
    }
    input.focus();
});

document.querySelectorAll(".preset-pill").forEach(button => {
    button.addEventListener("click", () => {
        const preset = button.dataset.preset;
        if (preset === "geral") {
            activePresets = new Set(["geral"]);
        } else {
            if (activePresets.has(preset)) {
                activePresets.delete(preset);
                if (!activePresets.size) activePresets = new Set(["geral"]);
            } else {
                if (activePresets.size >= 3) return showToast("Escolha no máximo três especialidades iniciais.");
                activePresets.delete("geral");
                activePresets.add(preset);
            }
        }
        document.querySelectorAll(".preset-pill").forEach(item => {
            item.classList.toggle("is-active", activePresets.has(item.dataset.preset));
        });
        document.querySelector("#preset-label").textContent = getQuickProfileLabel([...activePresets]);
    });
});

document.querySelectorAll(".player-mode-button").forEach(button => {
    button.addEventListener("click", () => {
        playerCreationMode = button.dataset.mode;
        document.querySelectorAll(".player-mode-button").forEach(item => item.setAttribute("aria-pressed", String(item === button)));
        syncPlayerCreationControls();
    });
});

document.querySelector("#bulk-add").addEventListener("click", () => {
    const input = document.querySelector("#bulk-input");
    const names = input.value.split(/[\n,;]+/).map(name => name.trim()).filter(Boolean);
    let added = 0;
    names.forEach(name => { if (addPlayer(name)) added += 1; });
    input.value = "";
    if (added) {
        savePlayers();
        renderRoster();
        invalidateTeams();
        showToast(`${added} ${added === 1 ? "jogador adicionado" : "jogadores adicionados"}.`);
    }
});

document.addEventListener("input", event => {
    const weakFootSlider = event.target.closest("input[data-weak-foot]");
    if (weakFootSlider) {
        const player = players.find(item => item.id === weakFootSlider.closest("[data-id]").dataset.id);
        if (!player) return;
        player.weakFoot = Math.min(5, Math.max(1, Number(weakFootSlider.value)));
        weakFootSlider.parentElement.querySelector("output").textContent = `${player.weakFoot}/5`;
        const card = weakFootSlider.closest(".player-card");
        const specialty = card.querySelector(".quick-profile-pill");
        if (specialty) specialty.textContent = `${getQuickProfileLabel(player.quickProfile || ["geral"])} · Pé fraco ${player.weakFoot}/5`;
        savePlayers();
        renderTeams();
        return;
    }
    const slider = event.target.closest("input[data-stat]");
    if (!slider) return;
    const player = players.find(item => item.id === slider.closest("[data-id]").dataset.id);
    if (!player) return;
    player.stats[slider.dataset.stat] = clampStat(Number(slider.value));
    const statRow = slider.closest(".stat-row");
    statRow.style.setProperty("--stat-color", statColor(slider.value));
    statRow.style.setProperty("--stat-progress", `${(Number(slider.value) - 1) / 98 * 100}%`);
    slider.parentElement.querySelector("output").textContent = slider.value;
    const group = slider.closest(".stat-group");
    if (group) {
        const summaryRating = group.querySelector(".stat-group-heading strong");
        const groupDefinition = allStatGroups.find(item => item.key === group.dataset.group);
        const rating = categoryRating(player, groupDefinition);
        summaryRating.textContent = rating;
        summaryRating.style.color = statColor(rating);
    }
    const card = slider.closest(".player-card");
    card.querySelector(".rating-display").outerHTML = renderStarRating(calculateStars(player));
    card.querySelector(".overall-badge").outerHTML = renderOverall(player);
    card.classList.remove("tier-elite", "tier-featured", "tier-regular", "tier-base");
    card.classList.add(`tier-${ratingTier(calculateOverall(player))}`);
    savePlayers();
    renderTeams();
});

document.addEventListener("click", event => {
    const goalkeeperButton = event.target.closest("[data-goalkeeper-preselect]");
    if (goalkeeperButton) {
        const playerId = goalkeeperButton.dataset.goalkeeperPreselect;
        if (preselectedGoalkeeperIds.has(playerId)) {
            preselectedGoalkeeperIds.delete(playerId);
        } else {
            preselectedGoalkeeperIds.add(playerId);
        }
        renderRoster();
        return;
    }
    const card = event.target.closest(".player-card");
    if (!card) return;
    const player = players.find(item => item.id === card.dataset.id);
    if (!player) return;
    const growthButton = event.target.closest("[data-growth-node]");
    if (growthButton) {
        unlockGrowthNode(player, growthButton.dataset.growthNode);
    } else if (event.target.closest(".remove")) {
        preselectedGoalkeeperIds.delete(player.id);
        players.splice(players.indexOf(player), 1);
        savePlayers();
        removePlayerFromProfessionalTeams(player.id);
        renderRoster();
        invalidateTeams();
        renderEvolution();
    } else if (event.target.closest(".edit")) {
        const nextName = prompt("Nome do jogador:", player.name);
        if (nextName === null) return;
        const cleanName = nextName.trim().replace(/\s+/g, " ");
        if (!cleanName) return showToast("O nome não pode ficar vazio.");
        if (players.some(item => item.id !== player.id && item.name.toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR"))) return showToast("Já existe um jogador com esse nome.");
        player.name = cleanName;
        savePlayers();
        renderRoster();
        renderProfessionalTeams();
        renderTeams();
        renderEvolution();
    }
});

function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1));
        [result[index], result[other]] = [result[other], result[index]];
    }
    return result;
}

function wait(milliseconds) {
    return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

async function animateDraw(shuffled, nextTeams) {
    const overlay = document.querySelector("#draw-overlay");
    const playerLabel = document.querySelector("#draw-player");
    const destinationLabel = document.querySelector("#draw-destination");
    const progressLabel = document.querySelector("#draw-progress");
    const stageTitle = document.querySelector("#draw-stage-title");
    const teamACount = document.querySelector("#draw-team-a-count");
    const teamBCount = document.querySelector("#draw-team-b-count");
    const progressBar = document.querySelector("#draw-progress-bar");
    const teamRosters = [document.querySelector("#draw-team-a-roster"), document.querySelector("#draw-team-b-roster")];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealDuration = 5000;
    const interval = revealDuration / shuffled.length;
    const teamByPlayerId = new Map(nextTeams.flatMap((team, teamIndex) => team.map(player => [player.id, teamIndex])));
    const assignedCounts = [0, 0];

    drawButton.disabled = true;
    stageTitle.textContent = "Sorteando os times";
    teamACount.textContent = "0";
    teamBCount.textContent = "0";
    progressBar.style.width = "0%";
    teamRosters.forEach(roster => { roster.replaceChildren(); });
    overlay.classList.add("is-active");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("draw-active");

    for (const [index, player] of shuffled.entries()) {
        const teamIndex = teamByPlayerId.get(player.id);
        playerLabel.textContent = player.name;
        destinationLabel.textContent = `TIME ${teamIndex === 0 ? "A" : "B"}`;
        destinationLabel.dataset.team = teamIndex === 0 ? "a" : "b";
        progressLabel.textContent = `${index + 1} / ${shuffled.length} jogadores escalados`;
        progressBar.style.width = `${(index + 1) / shuffled.length * 100}%`;
        assignedCounts[teamIndex] += 1;
        teamACount.textContent = String(assignedCounts[0]);
        teamBCount.textContent = String(assignedCounts[1]);
        const rosterEntry = document.createElement("li");
        rosterEntry.textContent = player.name;
        teamRosters[teamIndex].append(rosterEntry);
        if (!reducedMotion) {
            playerLabel.animate([
                { opacity: 0, transform: "translateY(9px)" },
                { opacity: 1, transform: "translateY(0)" }
            ], { duration: Math.min(360, interval * 0.65), easing: "cubic-bezier(.2,.8,.2,1)" });
        }
        await wait(interval);
    }

    stageTitle.textContent = "Equipes definidas";
    playerLabel.textContent = "Que comece o jogo.";
    destinationLabel.textContent = "SORTEIO CONCLUÍDO";
    destinationLabel.removeAttribute("data-team");
    document.querySelector("#team-description").textContent = "Apita o juiz. Valendo!";
    await wait(reducedMotion ? 80 : 560);

    teams = nextTeams;
    assignDefaultTeamCaptains();
    goalkeeperIds = new Set(nextTeams.flat().filter(player => preselectedGoalkeeperIds.has(player.id)).map(player => player.id));
    selectedPlayerId = null;
    comparisonPlayerIds = null;
    selectionMode = "swap";
    renderTeams();
    renderRoster();
    overlay.classList.remove("is-active");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("draw-active");
    drawButton.disabled = players.length < 2;
    playEffect("draw");
    showToast(`Times sorteados: ${teams[0].length} contra ${teams[1].length}.`);
}

drawButton.addEventListener("click", () => {
    if (activeMatchId) return showToast("Este jogo já foi salvo. Comece um novo jogo para sortear novamente.");
    if (players.length < 2) return;
    const nextTeams = buildBalancedTeams(players, preselectedGoalkeeperIds);
    if (teams && teams.every((team, teamIndex) => team.length === nextTeams[teamIndex].length && team.every(player => nextTeams[teamIndex].some(candidate => candidate.id === player.id)))) {
        let swap = null;
        nextTeams[0].forEach((firstPlayer, firstIndex) => {
            nextTeams[1].forEach((secondPlayer, secondIndex) => {
                const sameGoalkeeperStatus = preselectedGoalkeeperIds.has(firstPlayer.id) === preselectedGoalkeeperIds.has(secondPlayer.id);
                const ratingDifference = Math.abs(calculateOverall(firstPlayer) - calculateOverall(secondPlayer));
                if (!swap || (sameGoalkeeperStatus && !swap.sameGoalkeeperStatus) || (sameGoalkeeperStatus === swap.sameGoalkeeperStatus && ratingDifference < swap.ratingDifference)) {
                    swap = { firstIndex, secondIndex, sameGoalkeeperStatus, ratingDifference };
                }
            });
        });
        if (swap) [nextTeams[0][swap.firstIndex], nextTeams[1][swap.secondIndex]] = [nextTeams[1][swap.secondIndex], nextTeams[0][swap.firstIndex]];
    }
    const shuffled = shuffle(nextTeams.flat());
    animateDraw(shuffled, nextTeams);
});

function applyBalancedTeams() {
    if (!players.length || activeMatchId) return;
    teams = buildBalancedTeams(players, preselectedGoalkeeperIds);
    assignDefaultTeamCaptains();
    goalkeeperIds = new Set(teams.flat().filter(player => preselectedGoalkeeperIds.has(player.id)).map(player => player.id));
    selectedPlayerId = null;
    comparisonPlayerIds = null;
    selectionMode = "swap";
    renderTeams();
    renderRoster();
    playEffect("draw");
    showToast("Times equilibrados pela nota geral.");
}

function handleTeamSelection(event) {
    const balanceButton = event.target.closest("#balance-teams");
    if (balanceButton) {
        applyBalancedTeams();
        return;
    }
    const modeButton = event.target.closest("[data-selection-mode]");
    if (modeButton) {
        selectionMode = modeButton.dataset.selectionMode;
        selectedPlayerId = null;
        comparisonPlayerIds = null;
        renderTeams();
        return;
    }
    if (event.target.closest(".comparison-clear")) {
        selectedPlayerId = null;
        comparisonPlayerIds = null;
        renderTeams();
        return;
    }
    if (event.target.closest("select, input, label, button, summary")) return;
    if (event.target.closest(".player-skills-disclosure")) return;
    const card = event.target.closest(".team-player");
    if (!card || !teams) return;
    const playerId = card.dataset.id;
    const teamIndex = Number(card.dataset.team);
    if (selectionMode === "compare") {
        if (!selectedPlayerId || selectedPlayerId === playerId) {
            selectedPlayerId = selectedPlayerId === playerId ? null : playerId;
            renderTeams();
            return;
        }
        comparisonPlayerIds = [selectedPlayerId, playerId];
        selectedPlayerId = null;
        renderTeams();
        return;
    }
    if (!selectedPlayerId) {
        selectedPlayerId = playerId;
        renderTeams();
        return;
    }
    if (selectedPlayerId === playerId) {
        selectedPlayerId = null;
        renderTeams();
        return;
    }
    const otherTeamIndex = teams.findIndex(team => team.some(player => player.id === selectedPlayerId));
    if (otherTeamIndex === teamIndex) {
        selectedPlayerId = playerId;
        renderTeams();
        return;
    }
    const firstIndex = teams[otherTeamIndex].findIndex(player => player.id === selectedPlayerId);
    const secondIndex = teams[teamIndex].findIndex(player => player.id === playerId);
    [teams[otherTeamIndex][firstIndex], teams[teamIndex][secondIndex]] = [teams[teamIndex][secondIndex], teams[otherTeamIndex][firstIndex]];
    const previousGoalkeepers = [...goalkeeperIds];
    goalkeeperIds.clear();
    teams.forEach(team => {
        const keeper = team.find(player => previousGoalkeepers.includes(player.id));
        if (keeper) goalkeeperIds.add(keeper.id);
    });
    const previousCaptains = new Set(teamCaptainIds.filter(Boolean));
    teamCaptainIds = teams.map(team => team.find(player => previousCaptains.has(player.id))?.id || team[0]?.id || null);
    preselectedGoalkeeperIds = new Set(goalkeeperIds);
    selectedPlayerId = null;
    renderTeams();
    renderRoster();
    playEffect("swap");
    showToast("Troca feita. Os times continuam com o mesmo número de jogadores.");
}

function handleTeamCaptainChange(event) {
    const captainSelect = event.target.closest("[data-team-captain]");
    if (!captainSelect || !teams || activeMatchId) return;
    const teamIndex = Number(captainSelect.dataset.teamCaptain);
    const playerId = captainSelect.value;
    if (!teams[teamIndex]?.some(player => player.id === playerId)) return;
    const resultValues = [...recordingArea.querySelectorAll("[data-result-stat]")].map(input => ({
        playerId: input.dataset.playerId,
        stat: input.dataset.resultStat,
        value: input.value
    }));
    teamCaptainIds[teamIndex] = playerId;
    renderTeams();
    resultValues.forEach(({ playerId: resultPlayerId, stat, value }) => {
        const input = recordingArea.querySelector(`[data-result-stat="${stat}"][data-player-id="${CSS.escape(resultPlayerId)}"]`);
        if (input) input.value = value;
    });
    updateLiveScore();
}

teamsArea.addEventListener("click", handleTeamSelection);
teamsArea.addEventListener("change", handleTeamCaptainChange);
teamsArea.addEventListener("keydown", event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!event.target.matches(".team-player")) return;
    event.preventDefault();
    handleTeamSelection(event);
});

initializeSettings();
initializeDashboard();
renderRoster();
renderTeams();
renderHome();
renderHistory();
renderRankings();
renderPayments();
preloadBundledAudio();