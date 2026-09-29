"use strict";

const STORAGE_KEY = "racha.players.v1";
const SETTINGS_KEY = "racha.settings.v1";
const MATCHES_KEY = "racha.matches.v1";
const GAME_SETUP_KEY = "racha.game-setup.v1";
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
const rosterElement = document.querySelector("#roster");
const teamsArea = document.querySelector("#teams-area");
const recordingArea = document.querySelector("#match-recording");
const drawButton = document.querySelector("#draw-button");
const players = loadPlayers();
let teams = null;
let selectedPlayerId = null;
let comparisonPlayerIds = null;
let selectionMode = "swap";
let toastTimer;
let customCrowdUrl = null;
let customMusicUrl = null;
let customMusicAudio = null;
let stadiumAudio = null;
let audioPreloadPromise;
const bundledAudioUrls = new Map();
const bundledAudioPaths = [
    "assets/audio/maracana-crowd.mp3",
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
let activeMatchSetup = null;
let activeMatchId = null;
let rankingPeriod = "day";

function loadAudioSettings() {
    const defaults = { effectsEnabled: true, effectsVolume: 45, musicEnabled: false, musicVolume: 18, theme: "gramado", mode: "dark" };
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
        return {
            effectsEnabled: saved.effectsEnabled !== false,
            effectsVolume: clampVolume(saved.effectsVolume ?? defaults.effectsVolume),
            musicEnabled: saved.musicEnabled === true,
            musicVolume: clampVolume(saved.musicVolume ?? defaults.musicVolume),
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
    document.querySelector("#crowd-audio-name").textContent = customCrowdUrl ? "Áudio carregado; toca ao sortear ou trocar times." : "Opcional: carregue um canto ou torcida do aparelho.";
    document.querySelector("#music-audio-name").textContent = customMusicUrl ? "Trilha carregada; disponível enquanto esta aba estiver aberta." : "Opcional: use uma música do seu aparelho.";
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
    audio.volume = Math.min(1, volume);
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
    const stadiumUrl = bundledAudioUrls.get("assets/audio/maracana-crowd.mp3");
    if (!customMusicAudio && stadiumUrl === undefined) {
        preloadBundledAudio().then(() => {
            if (audioSettings.musicEnabled) startBackgroundMusic();
        });
        return;
    }
    if (!customMusicAudio && !stadiumUrl) {
        audioSettings.musicEnabled = false;
        updateAudioControls();
        saveAudioSettings();
        showToast("Não foi possível carregar a gravação do estádio.");
        return;
    }
    const audio = customMusicAudio || (stadiumAudio ||= new Audio(stadiumUrl));
    audio.loop = true;
    audio.volume = audioSettings.musicVolume / 100;
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
            if (audio) audio.volume = audioSettings.musicVolume / 100;
        }
        if (audioSettings.musicEnabled && audioSettings.musicVolume > 0) startBackgroundMusic();
        else if (audioSettings.musicVolume === 0) stopBackgroundMusic();
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
        Object.assign(audioSettings, { effectsEnabled: true, effectsVolume: 45, musicEnabled: false, musicVolume: 18, theme: "gramado", mode: "dark" });
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
            statGroups.forEach(group => {
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
            return {
                id: typeof player.id === "string" ? player.id : createId(),
                name: player.name.trim().slice(0, 32),
                stats
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
    const defaults = { date: localDateKey(), time: "21:00", venue: "", fee: 0 };
    try {
        const saved = JSON.parse(localStorage.getItem(GAME_SETUP_KEY) || "{}");
        return {
            date: /^\d{4}-\d{2}-\d{2}$/.test(saved.date || "") ? saved.date : defaults.date,
            time: /^\d{2}:\d{2}$/.test(saved.time || "") ? saved.time : defaults.time,
            venue: typeof saved.venue === "string" ? saved.venue.slice(0, 60) : defaults.venue,
            fee: Number.isFinite(Number(saved.fee)) ? Math.max(0, Number(saved.fee)) : defaults.fee
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

function makePlayer(name) {
    const stats = {};
    statGroups.forEach(group => {
        group.stats.forEach(([key, , value]) => { stats[key] = value; });
    });
    return { id: createId(), name, stats };
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function calculateStars(player) {
    const ratings = statGroups.flatMap(group => group.stats.map(([key]) => player.stats[key]));
    const average = ratings.reduce((total, value) => total + value, 0) / ratings.length;
    return Math.max(1, Math.min(5, Math.round((1 + (average - 1) * 4 / 98) * 2) / 2));
}

function calculateOverall(player) {
    const ratings = statGroups.flatMap(group => group.stats.map(([key]) => player.stats[key]));
    return Math.round(ratings.reduce((total, value) => total + value, 0) / ratings.length);
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
    const stars = Array.from({ length: 5 }, (_, index) => {
        const fill = Math.max(0, Math.min(1, rating - index));
        const state = fill === 1 ? "full" : fill === 0.5 ? "half" : "empty";
        return `<span class="rating-star ${state}" aria-hidden="true">★</span>`;
    }).join("");
    return `<span class="rating-display" aria-label="${formatStars(rating)} de 5 estrelas"><span class="rating-stars" aria-hidden="true">${stars}</span><span class="rating-number">${formatStars(rating)}</span></span>`;
}

function renderOverall(player) {
    const overall = calculateOverall(player);
    return `<span class="overall-badge tier-${ratingTier(overall)}" aria-label="Nota geral ${overall} de 99"><strong style="color: ${statColor(overall)}">${overall}</strong><small>GER</small></span>`;
}

function renderSkillDisclosure(player, editable) {
    const groups = statGroups.map(group => `<section class="stat-group" data-group="${group.key}">
        <div class="stat-group-heading"><span>${group.name}</span><strong style="color: ${statColor(categoryRating(player, group))}">${categoryRating(player, group)}</strong></div>
        <div class="stat-list">${group.stats.map(([key, label]) => editable
            ? `<label class="stat-row" style="${statStyle(player.stats[key])}"><span>${label}</span><input type="range" min="1" max="99" value="${player.stats[key]}" data-stat="${key}" aria-label="${label} de ${escapeHtml(player.name)}"><output>${player.stats[key]}</output></label>`
            : `<div class="stat-row"><span>${label}</span><span class="team-stat-value" style="color: ${statColor(player.stats[key])}">${player.stats[key]}</span></div>`
        ).join("")}</div>
      </section>`).join("");
    return `<details class="player-skills-disclosure"><summary><span>Ver habilidades</span><span class="disclosure-count">18 atributos</span></summary><div class="disclosed-groups">${groups}</div></details>`;
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
    if (!entries.length) return '<div class="data-empty"><span aria-hidden="true">⚽</span><p>Nenhum gol ou assistência registrado neste período.</p></div>';
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
        teams: teams.map(team => team.map(player => player.id)),
        participants,
        stats,
        score,
        payments: Object.fromEntries(participants.map(participant => [participant.id, false]))
    };
    matches.unshift(match);
    activeMatchId = match.id;
    drawButton.disabled = true;
    document.querySelector("#clear-teams").disabled = true;
    saveMatches();
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
    if (viewName === "match" && !activeMatchSetup) activeMatchSetup = { ...gameSetup };
    if (viewName === "home") renderHome();
    if (viewName === "history") renderHistory();
    if (viewName === "ranking") renderRankings();
    if (viewName === "payments") renderPayments();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function readGameSetup() {
    gameSetup = {
        date: document.querySelector("#game-date").value,
        time: document.querySelector("#game-time").value,
        venue: document.querySelector("#game-venue").value.trim(),
        fee: Math.max(0, Number(document.querySelector("#game-fee").value) || 0)
    };
    saveGameSetup();
}

function startNewMatch() {
    readGameSetup();
    activeMatchSetup = { ...gameSetup };
    activeMatchId = null;
    teams = null;
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
    document.querySelector("#game-date").value = gameSetup.date;
    document.querySelector("#game-time").value = gameSetup.time;
    document.querySelector("#game-venue").value = gameSetup.venue;
    document.querySelector("#game-fee").value = gameSetup.fee || "";
    document.querySelectorAll("[data-view-target]").forEach(button => button.addEventListener("click", () => showAppView(button.dataset.viewTarget)));
    document.querySelector("#setup-form").addEventListener("input", readGameSetup);
    document.querySelector("#setup-form").addEventListener("submit", event => {
        event.preventDefault();
        startNewMatch();
    });
    document.querySelector("#clear-players").addEventListener("click", () => {
        if (!players.length) return showToast("A lista de jogadores já está vazia.");
        if (!window.confirm("Apagar todos os jogadores cadastrados? O histórico de partidas e pagamentos será mantido.")) return;
        players.length = 0;
        teams = null;
        activeMatchId = null;
        activeMatchSetup = { ...gameSetup };
        selectedPlayerId = null;
        comparisonPlayerIds = null;
        savePlayers();
        renderRoster();
        renderTeams();
        renderHome();
        showToast("Jogadores removidos. O histórico foi mantido.");
    });
    document.querySelector("#clear-teams").addEventListener("click", () => {
        if (!teams || activeMatchId) return;
        teams = null;
        selectedPlayerId = null;
        comparisonPlayerIds = null;
        selectionMode = "swap";
        renderTeams();
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
    selectedPlayerId = null;
    comparisonPlayerIds = null;
    selectionMode = "swap";
    renderTeams();
}

function renderRoster() {
    document.querySelector("#roster-count").textContent = players.length;
    document.querySelector("#summary-count").textContent = `${players.length} ${players.length === 1 ? "jogador" : "jogadores"}`;
    drawButton.disabled = players.length < 2;
    if (players.length === 0) {
        rosterElement.innerHTML = '<div class="empty-roster">Sua lista começa com o primeiro nome.<br>Cadastre pelo menos 2 jogadores para sortear.</div>';
        return;
    }
    rosterElement.innerHTML = players.map(player => {
        const stars = calculateStars(player);
                const tier = ratingTier(calculateOverall(player));
        return `
            <article class="player-card tier-${tier}" data-id="${player.id}">
                <div class="player-top"><span class="player-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span><span class="player-actions">${renderStarRating(stars)}${renderOverall(player)}<button class="icon-btn edit" type="button" aria-label="Editar nome de ${escapeHtml(player.name)}" title="Editar nome">✎</button><button class="icon-btn remove" type="button" aria-label="Remover ${escapeHtml(player.name)}" title="Remover jogador">×</button></span></div>
                ${renderSkillDisclosure(player, true)}
      </article>`;
    }).join("");
}

function renderPitchBall(gradientId = "pitch-ball-shell") {
    return `<svg class="pitch-ball-icon" viewBox="0 0 100 100" focusable="false"><defs><radialGradient id="${gradientId}" cx="34%" cy="27%" r="76%"><stop offset="0" stop-color="#fff"/><stop offset=".72" stop-color="#e7f0e3"/><stop offset="1" stop-color="#b9cbb7"/></radialGradient></defs><circle cx="50" cy="50" r="43" fill="url(#${gradientId})" stroke="#d3e7cf" stroke-width="2.5"/><path d="m50 32 16 12-6 19H40l-6-19z" fill="#14261a" stroke="#14261a" stroke-linejoin="round"/><path d="M50 32 49 8M66 44l22-8M60 63l14 20M40 63 26 83M34 44l-22-8M49 8l-17 3-10 8 4 15 18-2M88 36l-3-15-11-9-16-4-9 24M74 83l15-8 7-13-2-16-18-2-10 19M26 83l-14-8-7-13 2-16 18-2 15 19M12 36l-2-15 11-9 11-1M50 92l-15-3-9-6M50 92l15-3 9-6" fill="none" stroke="#263e2c" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2"/><path d="m49 32 1-24m16 36 22-8m-28 27 14 20M40 63 26 83M34 44l-22-8" fill="none" stroke="#a8ce73" stroke-linecap="round" stroke-width="1.8"/></svg>`;
}

function renderTeams() {
    document.querySelector("#clear-teams").disabled = !teams || Boolean(activeMatchId);
    if (!teams) {
        teamsArea.innerHTML = `<div class="team-empty"><span class="pitch-icon" aria-hidden="true">${renderPitchBall()}</span><p>Adicione os jogadores e sorteie os times para ver as escalações.</p></div>`;
        document.querySelector("#team-description").textContent = players.length > 0 ? "Sorteie novamente para montar as equipes." : "Seu próximo sorteio aparece aqui.";
        renderMatchRecording();
        return;
    }
    const teamTotal = teams[0].length + teams[1].length;
    const teamRatings = teams.map(teamOverall);
    const ratingDifference = Math.abs(teamRatings[0] - teamRatings[1]);
    const balanceLabel = ratingDifference <= 3 ? "Notas gerais próximas" : ratingDifference <= 8 ? "Diferença moderada" : `${ratingDifference} pontos de diferença`;
    const balancePercent = Math.round(Math.min(teamRatings[0], teamRatings[1]) / Math.max(teamRatings[0], teamRatings[1], 1) * 100);
    const compareContent = renderPlayerComparison();
    const selectionHint = selectionMode === "compare"
        ? selectedPlayerId ? "Agora escolha outro jogador para comparar." : comparisonPlayerIds ? "Escolha outra dupla ou troque de modo." : "Escolha dois jogadores de qualquer time."
        : selectedPlayerId ? "Agora escolha alguém do outro time para concluir a troca." : "Selecione um jogador de cada time para trocar.";
    document.querySelector("#team-description").textContent = `${teamTotal} jogadores distribuídos, sem deixar ninguém de fora.`;
    teamsArea.innerHTML = `<section class="match-summary" aria-label="Resumo do confronto">
        <div class="match-summary-heading"><span><i aria-hidden="true"></i> Escalação definida</span><strong>${teamTotal} jogadores</strong></div>
        <div class="match-result" aria-label="Nota geral: Time A ${teamRatings[0]}, Time B ${teamRatings[1]}">
            <div class="result-team result-a"><span>Time A</span><strong>${teamRatings[0]}<small>GER</small></strong></div>
            <span class="result-vs" aria-hidden="true">VS</span>
            <div class="result-team result-b"><span>Time B</span><strong>${teamRatings[1]}<small>GER</small></strong></div>
        </div>
        <div class="balance-status"><div class="balance-track" role="img" aria-label="${balanceLabel}"><span style="--balance-fill: ${balancePercent}%"></span></div><strong>${balanceLabel}</strong></div>
        </section><div class="team-interactions" role="group" aria-label="Ações entre jogadores">
                <button class="interaction-choice" type="button" data-selection-mode="swap" aria-pressed="${selectionMode === "swap"}">↔ <span>Trocar jogadores</span></button>
                <button class="interaction-choice" type="button" data-selection-mode="compare" aria-pressed="${selectionMode === "compare"}">⇄ <span>Comparar jogadores</span></button>
        </div>${compareContent}<div class="teams">${teams.map((team, teamIndex) => {
        return `
      <section class="team team-${teamIndex === 0 ? "a" : "b"}" aria-label="Time ${teamIndex === 0 ? "A" : "B"}">
        <div class="team-title"><h3><span class="team-dot"></span>Time ${teamIndex === 0 ? "A" : "B"}</h3><span class="team-meta"><span>${team.length} ${team.length === 1 ? "jogador" : "jogadores"}</span><strong>${teamRatings[teamIndex]} GER</strong></span></div>
        <div class="team-players">${team.map((player, playerIndex) => {
                        const actionLabel = selectionMode === "compare" ? `Selecionar ${player.name} para comparação` : selectedPlayerId ? `Trocar ${player.name} de time` : `Selecionar ${player.name} para troca`;
                        return `<article class="team-player tier-${ratingTier(calculateOverall(player))} ${selectedPlayerId === player.id ? "selected" : ""} ${selectedPlayerId ? "selectable" : ""}" style="--player-index: ${playerIndex}" data-id="${player.id}" data-team="${teamIndex}" role="group" tabindex="0" aria-label="${escapeHtml(actionLabel)}">
                                <div class="player-top"><span class="team-player-identity"><span class="player-name">${escapeHtml(player.name)}</span></span><span class="team-player-rating">${renderStarRating(calculateStars(player))}${renderOverall(player)}</span></div>
                ${renderSkillDisclosure(player, false)}
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
    players.push(makePlayer(cleanName));
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

rosterElement.addEventListener("input", event => {
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
        const groupDefinition = statGroups.find(item => item.key === group.dataset.group);
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

rosterElement.addEventListener("click", event => {
    const card = event.target.closest(".player-card");
    if (!card) return;
    const player = players.find(item => item.id === card.dataset.id);
    if (!player) return;
    if (event.target.closest(".remove")) {
        players.splice(players.indexOf(player), 1);
        savePlayers();
        renderRoster();
        invalidateTeams();
    } else if (event.target.closest(".edit")) {
        const nextName = prompt("Nome do jogador:", player.name);
        if (nextName === null) return;
        const cleanName = nextName.trim().replace(/\s+/g, " ");
        if (!cleanName) return showToast("O nome não pode ficar vazio.");
        if (players.some(item => item.id !== player.id && item.name.toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR"))) return showToast("Já existe um jogador com esse nome.");
        player.name = cleanName;
        savePlayers();
        renderRoster();
        renderTeams();
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
    const interval = Math.max(65, Math.min(220, 2100 / shuffled.length));
    const teamByPlayerId = new Map(nextTeams.flatMap((team, teamIndex) => team.map(player => [player.id, teamIndex])));

    drawButton.disabled = true;
    stageTitle.textContent = "Sorteando os times";
    overlay.classList.add("is-active");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("draw-active");

    for (const [index, player] of shuffled.entries()) {
        const teamIndex = teamByPlayerId.get(player.id);
        playerLabel.textContent = player.name;
        destinationLabel.textContent = `TIME ${teamIndex === 0 ? "A" : "B"}`;
        destinationLabel.dataset.team = teamIndex === 0 ? "a" : "b";
        progressLabel.textContent = `${index + 1} / ${shuffled.length} jogadores escalados`;
        await wait(interval);
    }

    stageTitle.textContent = "Times prontos!";
    playerLabel.textContent = "Que comece o jogo.";
    document.querySelector("#team-description").textContent = "Apita o juiz. Valendo!";
    await wait(450);

    teams = nextTeams;
    selectedPlayerId = null;
    comparisonPlayerIds = null;
    selectionMode = "swap";
    renderTeams();
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
    const shuffled = shuffle(players);
    const nextTeams = [[], []];
    shuffled.forEach((player, index) => nextTeams[index % 2].push(player));
    animateDraw(shuffled, nextTeams);
});

function handleTeamSelection(event) {
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
    selectedPlayerId = null;
    renderTeams();
    playEffect("swap");
    showToast("Troca feita. Os times continuam com o mesmo número de jogadores.");
}

teamsArea.addEventListener("click", handleTeamSelection);
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