"use strict";

import { Storage } from "./storage.js";
import { calculatePlayerOverall, calculatePlayerStars, createPlayer, loadPlayers as loadStoredPlayers, savePlayers as saveStoredPlayers } from "./players.js";
import { buildBalancedTeams, shuffle } from "./team-balancer.js";
import { createMatchRecord, loadGameSetup, loadMatches, localDateKey, saveGameSetup as saveStoredGameSetup, saveMatches as saveStoredMatches } from "./racha.js";
import { createProfessionalTeamsController, loadProfessionalTeams, saveProfessionalTeams as saveStoredProfessionalTeams } from "./professional-teams.js";
import { createRankingController } from "./ranking.js";
import { createPaymentsController } from "./payments.js";
import { createProfileController } from "./profile.js";
import { createVsController } from "./vs.js";
import { createSettingsController } from "./settings.js";
import { createHomeController } from "./home-ui.js";

const STORAGE_KEY = "racha.players.v1";
const TEST_SESSION_KEY = "racha.test-session.v1";
const TEST_SESSION_TAB_KEY = "racha.test-session-tab.v1";
const TEST_SESSION_ACTIVITY_KEY = "racha.test-session-activity.v1";
const DEVELOPMENT_TEST_RESET = true;
const TEST_SESSION_TAB_TTL = 90000;

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
            [STORAGE_KEY, "racha.matches.v1", "racha.game-setup.v1", "racha.professional-teams.v1"].forEach(key => Storage.remove(key));
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

let matches = loadMatches();
let gameSetup = loadGameSetup(localDateKey());
let matchMode = gameSetup.mode;
let activeMatchSetup = null;
let activeMatchId = null;
let rankingPeriod = "day";
let activeProfessionalTab = "teams";
const { playEffect, initializeSettings } = createSettingsController({
    documentRef: document,
    windowRef: window,
    showToast
});

function loadPlayers() {
    return loadStoredPlayers({
        allStatGroups,
        legacyGroupIndexes,
        previousProfileDefaults,
        quickProfiles,
        growthNodeIds,
        matches,
        createId,
        clampStat
    });
}

function savePlayers() {
    if (!saveStoredPlayers(players)) showToast("Não foi possível salvar neste navegador.");
}

function saveMatches() {
    if (!saveStoredMatches(matches)) showToast("Não foi possível salvar o histórico neste navegador.");
}

function saveGameSetup() {
    if (!saveStoredGameSetup(gameSetup)) showToast("Não foi possível salvar a configuração do jogo.");
}

function saveProfessionalTeams() {
    if (!saveStoredProfessionalTeams(professionalTeams)) showToast("Não foi possível salvar as equipes neste navegador.");
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
const { getRankingEntries, renderRankings } = createRankingController({
    documentRef: document,
    matches,
    getPeriod: () => rankingPeriod,
    localDateKey,
    escapeHtml,
    renderPitchBall
});
const { renderHome, renderHistory } = createHomeController({
    documentRef: document,
    getMatches: () => matches,
    getPlayers: () => players,
    getToday: () => localDateKey(),
    getRankingEntries,
    escapeHtml,
    formatMatchDate
});
const { renderPayments, setAllPayments, handlePaymentClick } = createPaymentsController({
    documentRef: document,
    windowRef: window,
    matches,
    saveMatches,
    renderHome,
    showToast,
    formatCurrency,
    formatMatchDate,
    escapeHtml
});
const {
    renderProfessionalTeams,
    removePlayerFromProfessionalTeams,
    createProfessionalTeam,
    handleProfessionalTeamAction,
    handleProfessionalTeamChange,
    addProfessionalTeamPlayer
} = createProfessionalTeamsController({
    documentRef: document,
    players,
    professionalTeams,
    createId,
    escapeHtml,
    saveProfessionalTeams,
    showToast
});
const { renderPlayerComparison } = createVsController({
    players,
    getTeams: () => teams,
    getComparisonPlayerIds: () => comparisonPlayerIds,
    statGroups,
    calculateOverall,
    escapeHtml
});
const {
    renderEvolution,
    unlockGrowthNode,
    handleProfileInput
} = createProfileController({
    documentRef: document,
    players,
    getMatchMode: () => matchMode,
    allStatGroups,
    growthBranches,
    premiumNodeId,
    premiumPrerequisites,
    calculateOverall,
    calculateStars,
    ratingTier,
    renderStarRating,
    renderOverall,
    getQuickProfileLabel,
    escapeHtml,
    statColor,
    statStyle,
    clampStat,
    savePlayers,
    renderRoster,
    renderTeams,
    showToast
});

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
    return createPlayer(name, profileNames, height, weight, {
        matchMode,
        allStatGroups,
        quickProfiles,
        createId,
        applyQuickProfile
    });
}

function escapeHtml(value) {
    return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function calculateStars(player) {
    return calculatePlayerStars(player, matchMode, statGroups);
}

function calculateOverall(player) {
    return calculatePlayerOverall(player, matchMode, statGroups);
}

function ratingTier(rating) {
    if (rating >= 90) return "elite";
    if (rating >= 80) return "featured";
    if (rating >= 70) return "regular";
    return "base";
}

function teamOverall(team) {
    return team.length ? Math.round(team.reduce((total, player) => total + calculateOverall(player), 0) / team.length) : 0;
}

function assignDefaultTeamCaptains() {
    teamCaptainIds = teams.map(team => team[0]?.id || null);
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
    const participants = teams.flatMap(team => team.map(player => player.id));
    const stats = Object.fromEntries(participants.map(participant => {
        const goalsInput = recordingArea.querySelector(`[data-result-stat="goals"][data-player-id="${CSS.escape(participant)}"]`);
        const assistsInput = recordingArea.querySelector(`[data-result-stat="assists"][data-player-id="${CSS.escape(participant)}"]`);
        return [participant, { goals: Math.max(0, Number(goalsInput?.value) || 0), assists: Math.max(0, Number(assistsInput?.value) || 0) }];
    }));
    const setup = activeMatchSetup || gameSetup;
    const match = createMatchRecord({ teams, stats, setup, mode: matchMode, teamCaptains: teamCaptainIds, createId });
    matches.unshift(match);
    match.participants.forEach(participant => {
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
        handlePaymentClick(event);
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

document.addEventListener("input", handleProfileInput);

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
    const nextTeams = buildBalancedTeams(players, preselectedGoalkeeperIds, calculateOverall);
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
    teams = buildBalancedTeams(players, preselectedGoalkeeperIds, calculateOverall);
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