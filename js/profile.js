export function createProfileController({
    documentRef,
    players,
    getMatchMode,
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
}) {
    function categoryRating(player, group) {
        const average = group.stats.reduce((total, [key]) => total + player.stats[key], 0) / group.stats.length;
        return Math.round(average);
    }

    function renderSkillDisclosure(player, editable, expanded = false) {
        editable = editable && getMatchMode() === "professional";
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

    function renderEvolution() {
        const roster = documentRef.querySelector("#evolution-roster");
        const matchMode = getMatchMode();
        if (matchMode !== "professional") {
            roster.innerHTML = '<div class="evolution-empty"><h2>Evolução profissional</h2><p>Acesse o Racha Profissional para editar atributos e acompanhar as trilhas de evolução.</p><button class="primary" type="button" data-view-target="professional">Abrir Racha Profissional</button></div>';
            return;
        }
        if (!players.length) {
            roster.innerHTML = '<div class="evolution-empty"><h2>Comece pela escalação</h2><p>Cadastre os jogadores na montagem para abrir suas habilidades e trilhas de evolução.</p><button class="primary" type="button" data-view-target="match">Ir para montagem</button></div>';
            return;
        }
        roster.innerHTML = players.map(player => `
        <article class="player-card evolution-player-card tier-${ratingTier(calculateOverall(player))}" data-id="${player.id}">
            <div class="player-top"><span class="player-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</span><span class="player-actions">${renderStarRating(calculateStars(player))}${renderOverall(player)}</span></div>
            <div class="quick-profile-pill">${escapeHtml(getQuickProfileLabel(player.quickProfile || ["geral"]))} · Pé fraco ${player.weakFoot}/5</div>
            ${renderSkillDisclosure(player, true, true)}
        </article>`).join("");
    }

    function handleProfileInput(event) {
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
    }

    return { renderEvolution, unlockGrowthNode, handleProfileInput };
}
