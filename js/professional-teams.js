import { Storage } from "./storage.js";
import { calculateClubRecord } from "./ranking.js";

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
            playerIds: [...new Set(team.playerIds.filter(id => typeof id === "string"))],
            crest: typeof team.crest === "string" ? team.crest : "",
            uniformPhoto: typeof team.uniformPhoto === "string" ? team.uniformPhoto : "",
            city: typeof team.city === "string" ? team.city.trim().slice(0, 60) : "",
            location: typeof team.location === "string" ? team.location.trim().slice(0, 100) : "",
            instagram: typeof team.instagram === "string" ? team.instagram.trim().slice(0, 60) : ""
        })).filter(team => team.name && (!team.captainId || team.playerIds.includes(team.captainId)));
}

export function createProfessionalTeamsController({
    documentRef,
    windowRef,
    players,
    matches,
    statGroups,
    professionalTeams,
    createId,
    escapeHtml,
    calculateOverall,
    saveProfessionalTeams,
    showToast
}) {
    function getPlayerMatchStats(playerId) {
        return matches.reduce((total, match) => {
            if (!match.participants.some(participant => participant.id === playerId)) return total;
            const stats = match.stats[playerId] || {};
            total.games += 1;
            total.goals += Math.max(0, Number(stats.goals) || 0);
            total.assists += Math.max(0, Number(stats.assists) || 0);
            return total;
        }, { games: 0, goals: 0, assists: 0 });
    }

    function getCategoryRating(player, group) {
        const values = group.stats.map(([key]) => Number(player.stats[key])).filter(Number.isFinite);
        return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    }

    async function compressImage(file, maxDimension) {
        if (!file) return "";
        if (!file.type.startsWith("image/")) throw new TypeError("Selecione um arquivo de imagem.");
        if (file.size > 10 * 1024 * 1024) throw new RangeError("Cada imagem deve ter no máximo 10 MB.");

        let bitmap;
        let imageUrl;
        try {
            if (typeof windowRef.createImageBitmap === "function") {
                bitmap = await windowRef.createImageBitmap(file);
            } else {
                imageUrl = windowRef.URL.createObjectURL(file);
                const image = new windowRef.Image();
                image.src = imageUrl;
                await new Promise((resolve, reject) => {
                    image.onload = resolve;
                    image.onerror = () => reject(new Error("Não foi possível ler a imagem selecionada."));
                });
                bitmap = image;
            }

            const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
            const canvas = documentRef.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * scale));
            canvas.height = Math.max(1, Math.round(bitmap.height * scale));
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Não foi possível processar a imagem neste navegador.");
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL("image/jpeg", 0.76);
        } finally {
            bitmap?.close?.();
            if (imageUrl) windowRef.URL.revokeObjectURL(imageUrl);
        }
    }

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
            const record = calculateClubRecord(matches, team);
            const captains = roster.map(player => `<option value="${escapeHtml(player.id)}" ${player.id === team.captainId ? "selected" : ""}>${escapeHtml(player.name)}</option>`).join("");
            const assignedElsewhere = new Set(professionalTeams.filter(other => other.id !== team.id).flatMap(other => other.playerIds));
            const availablePlayers = players.filter(player => !assignedElsewhere.has(player.id) && !team.playerIds.includes(player.id));
            const location = [team.location, team.city].filter(Boolean).map(escapeHtml).join(" · ");
            return `<article class="professional-team" data-professional-team="${escapeHtml(team.id)}">
            <header class="professional-team-head">${team.crest ? `<img class="club-crest" src="${escapeHtml(team.crest)}" alt="Escudo do ${escapeHtml(team.name)}">` : '<span class="club-crest club-crest-placeholder" aria-hidden="true">⚽</span>'}<div class="professional-team-title"><p class="eyebrow">RACHA PRO · CLUBE</p><h2>${escapeHtml(team.name)}</h2>${location ? `<small>📍 ${location}</small>` : ""}${team.instagram ? `<small>Instagram · ${escapeHtml(team.instagram)}</small>` : ""}</div><button class="secondary-action" type="button" data-team-delete="${escapeHtml(team.id)}" aria-label="Excluir clube ${escapeHtml(team.name)}">Excluir clube</button></header>
            ${team.uniformPhoto ? `<img class="club-uniform-photo" src="${escapeHtml(team.uniformPhoto)}" alt="Uniforme do ${escapeHtml(team.name)}">` : ""}
            <div class="professional-team-meta"><label>Capitão<select data-team-captain="${escapeHtml(team.id)}" ${roster.length < 2 ? "disabled" : ""}>${captains || '<option value="">Sem capitão</option>'}</select></label><strong>${roster.length} ${roster.length === 1 ? "jogador" : "jogadores"}</strong></div>
            <section class="club-record" aria-label="Campanha de ${escapeHtml(team.name)}"><header><h3>Campanha do clube</h3><small>Jogos RACHA com integrantes do elenco no mesmo time</small></header><dl><div><dt>Jogos</dt><dd>${record.games}</dd></div><div><dt>Vitórias</dt><dd>${record.wins}</dd></div><div><dt>Empates</dt><dd>${record.draws}</dd></div><div><dt>Derrotas</dt><dd>${record.losses}</dd></div><div><dt>Gols</dt><dd>${record.goals}</dd></div></dl></section>
            <form class="professional-add-player" data-team-add-form="${escapeHtml(team.id)}"><label>Adicionar jogador<select name="playerId" required ${availablePlayers.length ? "" : "disabled"}><option value="">${availablePlayers.length ? "Selecione um jogador disponível" : "Todos os jogadores já estão em equipes"}</option>${availablePlayers.map(player => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join("")}</select></label><button class="primary" type="submit" ${availablePlayers.length ? "" : "disabled"}>Adicionar</button></form>
            <h3 class="club-roster-heading">Elenco</h3><p class="club-stats-note">Desempenho acumulado nas partidas do RACHA.</p>
            <div class="club-player-grid">${roster.map(player => {
                const stats = getPlayerMatchStats(player.id);
                const goalkeeper = player.quickProfile?.includes("goleiro");
                const attributes = statGroups.map(group => `<div><span>${escapeHtml(group.name)}</span><strong>${getCategoryRating(player, group)}</strong></div>`).join("");
                return `<article class="club-player-card"><header><span class="club-player-icon" aria-hidden="true">${goalkeeper ? "🧤" : "⚽"}</span><div><h4>${escapeHtml(player.name)}</h4>${player.id === team.captainId ? "<small>CAPITÃO</small>" : ""}</div><strong class="club-player-overall">${calculateOverall(player)}<small>OVR</small></strong></header><div class="club-player-attributes">${attributes}</div><dl><div><dt>Jogos</dt><dd>${stats.games}</dd></div><div><dt>Gols</dt><dd>${stats.goals}</dd></div><div><dt>Assist.</dt><dd>${stats.assists}</dd></div></dl><button class="club-player-remove" type="button" data-team-remove-player="${escapeHtml(team.id)}" data-player-id="${escapeHtml(player.id)}" aria-label="Remover ${escapeHtml(player.name)} do clube">Remover do clube</button></article>`;
            }).join("") || '<p class="professional-roster-empty">Adicione jogadores para montar o elenco.</p>'}</div>
        </article>`;
        }).join("");
    }

    function removePlayerFromProfessionalTeams(playerId) {
        professionalTeams.forEach(team => {
            team.playerIds = team.playerIds.filter(id => id !== playerId);
            if (team.captainId === playerId) team.captainId = team.playerIds[0] || "";
        });
        saveProfessionalTeams();
        renderProfessionalTeams();
    }

    async function createProfessionalTeam(event) {
        event.preventDefault();
        const form = event.currentTarget;
        const nameInput = documentRef.querySelector("#professional-team-name");
        const captainSelect = documentRef.querySelector("#professional-team-captain");
        const name = nameInput.value.trim().replace(/\s+/g, " ").slice(0, 32);
        const captainId = captainSelect.value;
        if (!name || !players.some(player => player.id === captainId)) return showToast("Escolha um capitão disponível para criar a equipe.");
        if (professionalTeams.some(team => team.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"))) return showToast("Já existe uma equipe com esse nome.");
        if (professionalTeams.some(team => team.playerIds.includes(captainId))) return showToast("Este jogador já participa de outra equipe.");
        let crest;
        let uniformPhoto;
        try {
            crest = await compressImage(form.elements.namedItem("crest").files[0], 320);
            uniformPhoto = await compressImage(form.elements.namedItem("uniformPhoto").files[0], 900);
        } catch (error) {
            console.error("Não foi possível preparar as imagens do clube.", error);
            return showToast(error instanceof Error ? error.message : "Não foi possível processar as imagens selecionadas.");
        }
        const club = {
            id: createId(),
            name,
            captainId,
            playerIds: [captainId],
            crest,
            uniformPhoto,
            city: form.elements.namedItem("city").value.trim().slice(0, 60),
            location: form.elements.namedItem("location").value.trim().slice(0, 100),
            instagram: form.elements.namedItem("instagram").value.trim().replace(/^@/, "").slice(0, 60)
        };
        professionalTeams.push(club);
        if (!saveProfessionalTeams()) {
            professionalTeams.pop();
            return showToast("Não foi possível salvar o clube. Tente imagens menores ou libere espaço neste navegador.");
        }
        form.reset();
        renderProfessionalTeams();
        showToast(`${name} criado. ${players.find(player => player.id === captainId).name} é o capitão.`);
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
        if (!team.captainId) team.captainId = playerId;
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
