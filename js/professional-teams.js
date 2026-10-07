import { Storage } from "./storage.js";

const STORAGE_KEY = "racha.professional-teams.v1";

export function loadProfessionalTeams() {
    return normalizeProfessionalTeams(Storage.get(STORAGE_KEY, []));
}

export function saveProfessionalTeams(teams) {
    return Storage.set(STORAGE_KEY, teams);
}

export function normalizeProfessionalTeams(saved) {
    if (!Array.isArray(saved)) return [];
    return saved.filter(team => team && typeof team.id === "string" && typeof team.name === "string" && typeof team.captainId === "string" && Array.isArray(team.playerIds))
        .map(team => ({
            id: team.id,
            name: team.name.trim().slice(0, 32),
            captainId: team.captainId,
            playerIds: [...new Set(team.playerIds.filter(id => typeof id === "string"))]
        })).filter(team => team.name && team.playerIds.includes(team.captainId));
}

export function createProfessionalTeamsController({
    documentRef,
    players,
    professionalTeams,
    createId,
    escapeHtml,
    saveProfessionalTeams,
    showToast
}) {
    function renderProfessionalTeams() {
        const captainSelect = documentRef.querySelector("#professional-team-captain");
        const teamList = documentRef.querySelector("#professional-team-list");
        if (!captainSelect || !teamList) return;
        const assignedPlayerIds = new Set(professionalTeams.flatMap(team => team.playerIds));
        const availableCaptains = players.filter(player => !assignedPlayerIds.has(player.id));
        captainSelect.innerHTML = `<option value="">Selecione um jogador</option>${availableCaptains.map(player => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join("")}`;
        documentRef.querySelector("#professional-team-form button[type='submit']").disabled = availableCaptains.length === 0;

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
        const nameInput = documentRef.querySelector("#professional-team-name");
        const captainSelect = documentRef.querySelector("#professional-team-captain");
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

    return {
        renderProfessionalTeams,
        removePlayerFromProfessionalTeams,
        createProfessionalTeam,
        handleProfessionalTeamAction,
        handleProfessionalTeamChange,
        addProfessionalTeamPlayer
    };
}
