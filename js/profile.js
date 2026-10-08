export function createProfileController({
    documentRef,
    players,
    matches,
    windowRef,
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

    function getShareAttributes(player) {
        return [
            { key: "pace", label: "RITMO", icon: "⚡" },
            { key: "shooting", label: "FINALIZAÇÃO", icon: "🎯" },
            { key: "dribbling", label: "DRIBLE", icon: "🎩" },
            { key: "passing", label: "PASSE", icon: "🧠" },
            { key: "defending", label: "DEFESA", icon: "🛡" },
            { key: "physical", label: "FÍSICO", icon: "💪" }
        ].map(attribute => {
            const group = allStatGroups.find(item => item.key === attribute.key);
            return { ...attribute, value: group ? categoryRating(player, group) : 0 };
        });
    }

    function renderShareCard(player) {
        const stats = getPlayerMatchStats(player.id);
        const attributes = getShareAttributes(player);
        const whatsappText = [
            `⚽ Meu card no RACHA: ${player.name}`,
            `OVR ${calculateOverall(player)} · ${attributes.map(attribute => `${attribute.label} ${attribute.value}`).join(" · ")}`,
            `${stats.games} jogos · ${stats.goals} gols · ${stats.assists} assistências`
        ].join("\n");
        return `<section class="share-player-card" aria-label="Card compartilhável de ${escapeHtml(player.name)}">
            <header><span>⚽ RACHA</span><span>PLAYER CARD</span></header>
            <div class="share-player-identity"><strong>${escapeHtml(player.name)}</strong><div><b>${calculateOverall(player)}</b><span>OVR</span></div></div>
            <div class="share-player-attributes">${attributes.map(attribute => `<div><span aria-hidden="true">${attribute.icon}</span><strong>${attribute.value}</strong><small>${attribute.label}</small></div>`).join("")}</div>
            <dl><div><dt>JOGOS</dt><dd>${stats.games}</dd></div><div><dt>GOLS</dt><dd>${stats.goals}</dd></div><div><dt>ASSISTÊNCIAS</dt><dd>${stats.assists}</dd></div></dl>
            <footer>RACHA · FUTEBOL ENTRE AMIGOS</footer>
            <div class="share-player-card-actions"><button class="primary" type="button" data-share-player-card="${escapeHtml(player.id)}">Compartilhar card</button><button class="secondary-action" type="button" data-download-player-card="${escapeHtml(player.id)}">Baixar imagem</button><a class="secondary-action" href="https://wa.me/?text=${encodeURIComponent(whatsappText)}" target="_blank" rel="noopener noreferrer">WhatsApp</a></div>
        </section>`;
    }

    function drawShareCard(player) {
        const canvas = documentRef.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1440;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Não foi possível criar a imagem do card neste navegador.");

        const background = context.createLinearGradient(0, 0, 1080, 1440);
        background.addColorStop(0, "#1e3824");
        background.addColorStop(0.55, "#101a13");
        background.addColorStop(1, "#080d09");
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = "rgba(196, 244, 117, .13)";
        context.lineWidth = 2;
        for (let x = -1440; x < 1440; x += 90) {
            context.beginPath();
            context.moveTo(x, 0);
            context.lineTo(x + 1440, 1440);
            context.stroke();
        }
        context.strokeStyle = "#a6dd55";
        context.lineWidth = 8;
        context.strokeRect(32, 32, 1016, 1376);
        context.fillStyle = "#c8ef91";
        context.font = "700 38px Arial, sans-serif";
        context.fillText("RACHA", 88, 124);
        context.textAlign = "right";
        context.fillStyle = "#a9b8ac";
        context.font = "600 22px Arial, sans-serif";
        context.fillText("PLAYER CARD", 992, 122);
        context.textAlign = "left";
        context.fillStyle = "#f3f7f1";
        context.font = "800 64px Arial, sans-serif";
        context.fillText(player.name.toLocaleUpperCase("pt-BR").slice(0, 20), 88, 266, 900);
        context.fillStyle = "#c8ef91";
        context.font = "800 220px Arial, sans-serif";
        context.fillText(String(calculateOverall(player)), 76, 512);
        context.fillStyle = "#dce8dc";
        context.font = "700 38px Arial, sans-serif";
        context.fillText("OVR", 95, 566);

        const attributes = getShareAttributes(player);
        attributes.forEach((attribute, index) => {
            const column = index % 2;
            const row = Math.floor(index / 2);
            const x = 90 + column * 470;
            const y = 680 + row * 130;
            context.fillStyle = "rgba(255, 255, 255, .06)";
            context.fillRect(x, y - 60, 425, 98);
            context.fillStyle = "#c8ef91";
            context.font = "800 48px Arial, sans-serif";
            context.fillText(String(attribute.value), x + 18, y);
            context.fillStyle = "#f3f7f1";
            context.font = "700 21px Arial, sans-serif";
            context.fillText(attribute.label, x + 128, y - 5);
        });

        const stats = getPlayerMatchStats(player.id);
        const metrics = [["JOGOS", stats.games], ["GOLS", stats.goals], ["ASSISTÊNCIAS", stats.assists]];
        context.fillStyle = "rgba(166, 221, 85, .12)";
        context.fillRect(74, 1112, 932, 150);
        metrics.forEach(([label, value], index) => {
            const x = 225 + index * 315;
            context.textAlign = "center";
            context.fillStyle = "#c8ef91";
            context.font = "800 58px Arial, sans-serif";
            context.fillText(String(value), x, 1190);
            context.fillStyle = "#dce8dc";
            context.font = "700 19px Arial, sans-serif";
            context.fillText(label, x, 1230);
        });
        context.textAlign = "center";
        context.fillStyle = "#a9b8ac";
        context.font = "600 19px Arial, sans-serif";
        context.fillText("FUTEBOL ENTRE AMIGOS", 540, 1348);
        return canvas;
    }

    function downloadShareCard(player, canvas = drawShareCard(player), showNotification = true) {
        const link = documentRef.createElement("a");
        const safeName = player.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLocaleLowerCase("en-US") || "jogador";
        link.download = `racha-card-${safeName}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        if (showNotification) showToast("Imagem do card baixada.");
    }

    async function sharePlayerCard(player) {
        const canvas = drawShareCard(player);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Não foi possível gerar a imagem do card.");
        const safeName = player.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLocaleLowerCase("en-US") || "jogador";
        const file = typeof File === "function" ? new File([blob], `racha-card-${safeName}.png`, { type: "image/png" }) : null;
        if (file && typeof windowRef.navigator.share === "function" && windowRef.navigator.canShare?.({ files: [file] })) {
            await windowRef.navigator.share({ title: `Card de ${player.name} · RACHA`, text: "Meu card de jogador no RACHA!", files: [file] });
            return;
        }
        downloadShareCard(player, canvas, false);
        showToast("Imagem baixada. Anexe o PNG ao compartilhar pelo WhatsApp.");
    }

    async function handleShareCardClick(event) {
        const shareButton = event.target.closest("[data-share-player-card]");
        const downloadButton = event.target.closest("[data-download-player-card]");
        if (!shareButton && !downloadButton) return;
        const button = shareButton || downloadButton;
        const player = players.find(item => item.id === button.dataset.sharePlayerCard || item.id === button.dataset.downloadPlayerCard);
        if (!player) return;
        try {
            if (shareButton) await sharePlayerCard(player);
            else downloadShareCard(player);
        } catch (error) {
            if (error?.name === "AbortError") return;
            console.error("Não foi possível compartilhar o card do jogador.", error);
            showToast(error instanceof Error ? error.message : "Não foi possível compartilhar o card.");
        }
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
            ${renderShareCard(player)}
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
        const shareCard = card.querySelector(".share-player-card");
        if (shareCard) shareCard.outerHTML = renderShareCard(player);
        savePlayers();
        renderTeams();
    }

    documentRef.querySelector("#evolution-roster").addEventListener("click", handleShareCardClick);

    return { renderEvolution, unlockGrowthNode, handleProfileInput };
}
