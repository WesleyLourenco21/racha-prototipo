import { Storage } from "./storage.js";
import { renderLocationPreview } from "./map.js";
import { localDateKey } from "./racha.js";

const VS_STORAGE_KEY = "racha.vs.v1";

function isValidDateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isValidTime(value) {
    if (typeof value !== "string" || !/^\d{2}:\d{2}$/.test(value)) return false;
    const [hours, minutes] = value.split(":").map(Number);
    return hours < 24 && minutes < 60;
}

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

export function loadVSMatches() {
    const saved = Storage.get(VS_STORAGE_KEY, []);
    if (!Array.isArray(saved)) return [];
    return saved.filter(match => match && typeof match.id === "string" &&
        typeof match.homeClubId === "string" && typeof match.awayClubId === "string" &&
        match.homeClubId !== match.awayClubId && Array.isArray(match.homePlayers) &&
        Array.isArray(match.awayPlayers) && isValidDateKey(match.date) &&
        isValidTime(match.time) && typeof match.location === "string" &&
        match.location.trim()).map(match => ({
        ...match,
        homePlayers: [...new Set(match.homePlayers.filter(id => typeof id === "string"))],
        awayPlayers: [...new Set(match.awayPlayers.filter(id => typeof id === "string"))],
        homeClubName: typeof match.homeClubName === "string" ? match.homeClubName.slice(0, 32) : "",
        awayClubName: typeof match.awayClubName === "string" ? match.awayClubName.slice(0, 32) : "",
        homePlayerNames: Array.isArray(match.homePlayerNames) ? match.homePlayerNames.filter(name => typeof name === "string").map(name => name.slice(0, 32)) : [],
        awayPlayerNames: Array.isArray(match.awayPlayerNames) ? match.awayPlayerNames.filter(name => typeof name === "string").map(name => name.slice(0, 32)) : [],
        location: match.location.trim().slice(0, 200),
        status: "confirmed"
    }));
}

export function saveVSMatches(matches) {
    return Storage.set(VS_STORAGE_KEY, matches);
}

export function selectPlayerForVS(vs, playerId, club) {
    if (!vs || typeof playerId !== "string" || !playerId) return false;
    const players = club === "home" ? vs.homePlayers : club === "away" ? vs.awayPlayers : null;
    if (!players || players.includes(playerId)) return false;
    players.push(playerId);
    return true;
}

export function createVsController({
    documentRef,
    players,
    professionalTeams,
    getTeams,
    getComparisonPlayerIds,
    statGroups,
    calculateOverall,
    escapeHtml,
    showToast
}) {
    let vsMatches = loadVSMatches();

    function getClub(clubId) {
        return professionalTeams.find(team => team.id === clubId);
    }

    function renderClubOptions(select, selectedId) {
        select.innerHTML = `<option value="">Selecione um clube</option>${professionalTeams.map(team =>
            `<option value="${escapeHtml(team.id)}" ${team.id === selectedId ? "selected" : ""}>${escapeHtml(team.name)}</option>`
        ).join("")}`;
    }

    function renderRoster(clubId, side, selectedPlayerIds = []) {
        const roster = documentRef.querySelector(`#vs-${side}-roster`);
        const heading = documentRef.querySelector(`#vs-${side}-roster-heading`);
        const club = getClub(clubId);
        heading.textContent = club ? `Elenco · ${club.name}` : side === "home" ? "Elenco mandante" : "Elenco visitante";
        if (!club) {
            roster.innerHTML = '<p class="vs-roster-empty">Selecione um clube para ver seu elenco.</p>';
            return;
        }
        const clubPlayers = club.playerIds.map(id => players.find(player => player.id === id)).filter(Boolean);
        if (!clubPlayers.length) {
            roster.innerHTML = '<p class="vs-roster-empty">Este clube ainda não tem jogadores no elenco.</p>';
            return;
        }
        roster.innerHTML = clubPlayers.map(player => `<label class="vs-player-choice"><input type="checkbox" name="${side}PlayerIds" value="${escapeHtml(player.id)}" ${selectedPlayerIds.includes(player.id) ? "checked" : ""}><span>${escapeHtml(player.name)}</span><small>${calculateOverall(player)} OVR</small></label>`).join("");
    }

    function renderVsForm(preserveSelection = false) {
        const form = documentRef.querySelector("#vs-form");
        const homeSelect = documentRef.querySelector("#vs-home-club");
        const awaySelect = documentRef.querySelector("#vs-away-club");
        if (!form || !homeSelect || !awaySelect) return;
        const previousHomeId = homeSelect.value;
        const previousAwayId = awaySelect.value;
        const homePlayerIds = preserveSelection ? [...form.querySelectorAll('[name="homePlayerIds"]:checked')].map(input => input.value) : [];
        const awayPlayerIds = preserveSelection ? [...form.querySelectorAll('[name="awayPlayerIds"]:checked')].map(input => input.value) : [];
        renderClubOptions(homeSelect, previousHomeId);
        renderClubOptions(awaySelect, previousAwayId);
        renderRoster(homeSelect.value, "home", homePlayerIds);
        renderRoster(awaySelect.value, "away", awayPlayerIds);
        const locationInput = documentRef.querySelector("#vs-location");
        documentRef.querySelector("#vs-location-preview").innerHTML = renderLocationPreview(locationInput.value, escapeHtml);
        documentRef.querySelector("#vs-no-clubs").hidden = professionalTeams.length >= 2;
        form.hidden = professionalTeams.length < 2;
    }

    function renderUpcomingVS() {
        const list = documentRef.querySelector("#vs-upcoming-list");
        if (!list) return;
        const ordered = [...vsMatches].sort((first, second) => `${first.date}${first.time}`.localeCompare(`${second.date}${second.time}`));
        list.innerHTML = ordered.length ? ordered.map(match => {
            const home = getClub(match.homeClubId);
            const away = getClub(match.awayClubId);
            const clubLabel = (club, savedName) => club?.name || savedName || "Clube removido";
            const playerNames = (ids, savedNames = [], club) => ids.map((id, index) =>
                players.find(player => player.id === id)?.name || savedNames[index] || (club?.playerIds.includes(id) ? "Jogador removido" : "")
            ).filter(Boolean);
            const homeNames = playerNames(match.homePlayers, match.homePlayerNames, home);
            const awayNames = playerNames(match.awayPlayers, match.awayPlayerNames, away);
            const formattedDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date(`${match.date}T12:00:00`));
            return `<article class="vs-upcoming-card">
                <p class="eyebrow">PRÓXIMO CONFRONTO</p>
                <div class="vs-matchup">
                    <strong>${escapeHtml(clubLabel(home, match.homeClubName))}</strong><span>VS</span><strong>${escapeHtml(clubLabel(away, match.awayClubName))}</strong>
                </div>
                <div class="vs-match-details"><span>📅 ${escapeHtml(formattedDate)}</span><span>⏰ ${escapeHtml(match.time)}</span></div>
                <section class="vs-confirmed-location"><h3>📍 ${escapeHtml(match.location)}</h3>${renderLocationPreview(match.location, escapeHtml)}</section>
                <div class="vs-confirmed-rosters"><div><strong>${escapeHtml(clubLabel(home, match.homeClubName))}</strong><p>${homeNames.length ? homeNames.map(escapeHtml).join(" · ") : "Nenhum jogador selecionado"}</p></div><div><strong>${escapeHtml(clubLabel(away, match.awayClubName))}</strong><p>${awayNames.length ? awayNames.map(escapeHtml).join(" · ") : "Nenhum jogador selecionado"}</p></div></div>
                <button class="secondary-action" type="button" data-vs-delete="${escapeHtml(match.id)}" aria-label="Excluir confronto entre ${escapeHtml(clubLabel(home, match.homeClubName))} e ${escapeHtml(clubLabel(away, match.awayClubName))}">Excluir confronto</button>
            </article>`;
        }).join("") : '<div class="data-empty"><span aria-hidden="true">⚔️</span><p>Nenhum confronto confirmado. Escolha dois clubes para marcar o próximo jogo.</p></div>';
    }

    function renderVsPage() {
        renderVsForm();
        renderUpcomingVS();
    }

    function handleVsFormChange(event) {
        if (!event.target.matches("#vs-home-club, #vs-away-club")) return;
        const homeId = documentRef.querySelector("#vs-home-club").value;
        const awayId = documentRef.querySelector("#vs-away-club").value;
        if (homeId && homeId === awayId) {
            event.target.value = "";
            showToast("Escolha clubes diferentes para o confronto.");
        }
        renderVsForm(true);
    }

    function handleVsFormSubmit(event) {
        if (event.target.id !== "vs-form") return;
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const homeClubId = String(data.get("homeClubId") || "");
        const awayClubId = String(data.get("awayClubId") || "");
        const home = getClub(homeClubId);
        const away = getClub(awayClubId);
        if (!home || !away || homeClubId === awayClubId) return showToast("Escolha dois clubes diferentes para o confronto.");
        const homePlayers = data.getAll("homePlayerIds").map(String);
        const awayPlayers = data.getAll("awayPlayerIds").map(String);
        if (!homePlayers.length || !awayPlayers.length) return showToast("Selecione ao menos um jogador para cada clube.");
        if (homePlayers.some(id => !home.playerIds.includes(id) || !players.some(player => player.id === id)) ||
            awayPlayers.some(id => !away.playerIds.includes(id) || !players.some(player => player.id === id))) {
            return showToast("A escalação mudou. Confira os jogadores selecionados.");
        }
        const date = String(data.get("date") || "");
        const time = String(data.get("time") || "");
        const location = String(data.get("location") || "").trim().slice(0, 200);
        if (!isValidDateKey(date) || !isValidTime(time) || !location) return showToast("Informe uma data, um horário e um local válidos para a partida.");
        const confrontation = {
            ...createVS(homeClubId, awayClubId),
            homePlayers,
            awayPlayers,
            homeClubName: home.name,
            awayClubName: away.name,
            homePlayerNames: homePlayers.map(id => players.find(player => player.id === id).name),
            awayPlayerNames: awayPlayers.map(id => players.find(player => player.id === id).name),
            date,
            time,
            location,
            status: "confirmed"
        };
        vsMatches.unshift(confrontation);
        if (!saveVSMatches(vsMatches)) {
            vsMatches.shift();
            return showToast("Não foi possível salvar o confronto neste navegador.");
        }
        form.reset();
        documentRef.querySelector("#vs-date").value = localDateKey();
        documentRef.querySelector("#vs-time").value = "10:00";
        renderVsPage();
        showToast("Confronto confirmado e salvo neste navegador.");
    }

    function handleVsAction(event) {
        const button = event.target.closest("[data-vs-delete]");
        if (!button) return;
        const index = vsMatches.findIndex(match => match.id === button.dataset.vsDelete);
        if (index < 0) return;
        const [removed] = vsMatches.splice(index, 1);
        if (!saveVSMatches(vsMatches)) {
            vsMatches.splice(index, 0, removed);
            return showToast("Não foi possível excluir o confronto.");
        }
        renderUpcomingVS();
    }

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

    return {
        renderPlayerComparison,
        renderVsPage,
        handleVsFormChange,
        handleVsFormSubmit,
        handleVsAction
    };
}
