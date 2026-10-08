import { Storage } from "./storage.js";
import { createMapDirectionsUrl, createMapSearchUrl } from "./map.js";
import { localDateKey } from "./racha.js";

const OPEN_RUNS_STORAGE_KEY = "racha.open-runs.v1";
const RUN_ID = /^[\w-]{1,80}$/;

function validCoordinates(value) {
    return value && Number.isFinite(value.latitude) && value.latitude >= -90 && value.latitude <= 90 &&
        Number.isFinite(value.longitude) && value.longitude >= -180 && value.longitude <= 180;
}

function validDateAndTime(date, time) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) return false;
    const [year, month, day] = date.split("-").map(Number);
    const [hours, minutes] = time.split(":").map(Number);
    const parsedDate = new Date(year, month - 1, day);
    return parsedDate.getFullYear() === year && parsedDate.getMonth() === month - 1 &&
        parsedDate.getDate() === day && hours < 24 && minutes < 60;
}

function normalizeParticipant(participant, index = 0) {
    if (!participant || typeof participant.name !== "string" || !participant.name.trim()) return null;
    const status = ["confirmed", "maybe", "declined", "pending"].includes(participant.status) ? participant.status : "pending";
    return {
        id: typeof participant.id === "string" && participant.id
            ? participant.id.slice(0, 80)
            : typeof participant.responseId === "string" && participant.responseId
                ? participant.responseId.slice(0, 80)
                : `participant-${index}`,
        name: participant.name.trim().replace(/\s+/g, " ").slice(0, 32),
        status
    };
}

export function loadOpenRuns() {
    const saved = Storage.get(OPEN_RUNS_STORAGE_KEY, []);
    if (!Array.isArray(saved)) return [];
    return saved.filter(run => run && typeof run.id === "string" && RUN_ID.test(run.id) &&
        validDateAndTime(run.date, run.time) &&
        typeof run.venue === "string" && run.venue.trim()).map(run => ({
        id: run.id,
        title: typeof run.title === "string" ? run.title.trim().slice(0, 48) : "Racha aberto",
        date: run.date,
        time: run.time,
        venue: run.venue.trim().slice(0, 200),
        fee: Number.isFinite(Number(run.fee)) ? Math.max(0, Number(run.fee)) : 0,
        capacity: Number.isInteger(run.capacity) ? Math.min(50, Math.max(2, run.capacity)) : 16,
        coordinates: validCoordinates(run.coordinates)
            ? { latitude: run.coordinates.latitude, longitude: run.coordinates.longitude }
            : null,
        participants: Array.isArray(run.participants) ? run.participants.map(normalizeParticipant).filter(Boolean) : []
    }));
}

export function saveOpenRuns(runs) {
    return Storage.set(OPEN_RUNS_STORAGE_KEY, runs);
}

export function calculateDistanceKm(first, second) {
    if (!validCoordinates(first) || !validCoordinates(second)) return null;
    const radians = degrees => degrees * Math.PI / 180;
    const latitudeDelta = radians(second.latitude - first.latitude);
    const longitudeDelta = radians(second.longitude - first.longitude);
    const haversine = Math.sin(latitudeDelta / 2) ** 2 +
        Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) *
        Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function createOpenRun({ setup, capacity, coordinates, id, participants = [] }) {
    const titleDate = new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
        .format(new Date(`${setup.date}T12:00:00`));
    return {
        id,
        title: `Racha de ${titleDate.charAt(0).toLocaleUpperCase("pt-BR")}${titleDate.slice(1)}`,
        date: setup.date,
        time: setup.time,
        venue: setup.venue.trim().slice(0, 200),
        fee: setup.fee,
        capacity,
        coordinates: validCoordinates(coordinates)
            ? { latitude: Math.round(coordinates.latitude * 1000) / 1000, longitude: Math.round(coordinates.longitude * 1000) / 1000 }
            : null,
        participants: participants.map(normalizeParticipant).filter(Boolean)
    };
}

function encodePayload(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = "";
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodePayload(value) {
    try {
        const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
        const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
        return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return null;
    }
}

export function readRunLinkPayload(value) {
    const payload = decodePayload(value);
    if (!payload || typeof payload !== "object") return null;
    if (typeof payload.id !== "string" || !RUN_ID.test(payload.id) ||
        !validDateAndTime(payload.date, payload.time) ||
        typeof payload.venue !== "string" || !payload.venue.trim()) return null;
    return {
        id: payload.id,
        title: typeof payload.title === "string" ? payload.title.slice(0, 48) : "Racha aberto",
        date: payload.date,
        time: payload.time,
        venue: payload.venue.slice(0, 200),
        fee: Number.isFinite(Number(payload.fee)) ? Math.max(0, Number(payload.fee)) : 0,
        capacity: Number.isInteger(payload.capacity) ? Math.min(50, Math.max(2, payload.capacity)) : 16
    };
}

function getShareBaseUrl(href) {
    const url = new URL(href);
    url.search = "";
    url.hash = "";
    return url;
}

export function buildRunInviteUrl(run, href) {
    const url = getShareBaseUrl(href);
    const payload = {
        id: run.id,
        title: run.title,
        date: run.date,
        time: run.time,
        venue: run.venue,
        fee: run.fee,
        capacity: run.capacity
    };
    url.searchParams.set("convite", encodePayload(payload));
    return url.href;
}

export function buildRunResponseUrl(response, href) {
    const url = getShareBaseUrl(href);
    url.searchParams.set("resposta", encodePayload({
        runId: response.runId,
        name: response.name.trim().replace(/\s+/g, " ").slice(0, 32),
        status: response.status,
        responseId: response.responseId
    }));
    return url.href;
}

export function readRunResponse(value) {
    const payload = decodePayload(value);
    if (!payload || typeof payload !== "object" || typeof payload.runId !== "string" ||
        !RUN_ID.test(payload.runId) || typeof payload.name !== "string" ||
        !payload.name.trim() || !["confirmed", "maybe", "declined"].includes(payload.status) ||
        typeof payload.responseId !== "string" || !RUN_ID.test(payload.responseId)) return null;
    return {
        runId: payload.runId,
        name: payload.name.trim().replace(/\s+/g, " ").slice(0, 32),
        status: payload.status,
        responseId: payload.responseId
    };
}

export function createRunInviteMessage(run) {
    const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" })
        .format(new Date(`${run.date}T12:00:00`));
    const spotsLeft = Math.max(0, run.capacity - run.participants.filter(person => person.status === "confirmed").length);
    return `⚽ Convite para ${run.title}\n📅 ${date}\n⏰ ${run.time}\n📍 ${run.venue}\n💰 ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(run.fee)}\n🟢 ${spotsLeft} ${spotsLeft === 1 ? "vaga disponível" : "vagas disponíveis"}`;
}

export function createRunsController({ documentRef, windowRef, players, escapeHtml, formatCurrency, createId, showToast }) {
    let runs = loadOpenRuns();
    let nearbyCoordinates = null;
    let receivedInvite = null;

    function persistRuns(nextRuns, failureMessage) {
        const previousRuns = runs;
        runs = nextRuns;
        if (saveOpenRuns(runs)) return true;
        runs = previousRuns;
        showToast(failureMessage);
        return false;
    }

    function getAttendanceCounts(run) {
        return run.participants.reduce((counts, participant) => {
            counts[participant.status] += 1;
            return counts;
        }, { confirmed: 0, maybe: 0, declined: 0, pending: 0 });
    }

    function isUpcoming(run) {
        return `${run.date}T${run.time}` >= `${localDateKey()}T${new Date().toTimeString().slice(0, 5)}`;
    }

    function renderRunCard(run, distance) {
        const counts = getAttendanceCounts(run);
        const openSpots = Math.max(0, run.capacity - counts.confirmed);
        const invitationUrl = buildRunInviteUrl(run, windowRef.location.href);
        const shareText = `${createRunInviteMessage(run)}\n${invitationUrl}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        const participants = run.participants.length ? run.participants.map(participant => `<label class="run-attendance-row"><span>${escapeHtml(participant.name)}</span><select data-run-attendance="${escapeHtml(run.id)}" data-run-participant="${escapeHtml(participant.id)}" aria-label="Presença de ${escapeHtml(participant.name)}"><option value="pending" ${participant.status === "pending" ? "selected" : ""}>🔴 Não respondeu</option><option value="confirmed" ${participant.status === "confirmed" ? "selected" : ""}>🟢 Confirmado</option><option value="maybe" ${participant.status === "maybe" ? "selected" : ""}>🟡 Talvez</option><option value="declined" ${participant.status === "declined" ? "selected" : ""}>🔴 Não vai</option></select></label>`).join("") : '<p class="run-attendance-empty">As respostas enviadas ao capitão aparecem aqui.</p>';
        const routeLinks = `<a href="${createMapSearchUrl(run.venue)}" target="_blank" rel="noopener noreferrer">📍 Ver local</a><a href="${createMapDirectionsUrl(run.venue)}" target="_blank" rel="noopener noreferrer">Como chegar ↗</a>`;

        return `<article class="nearby-run-card" data-open-run="${escapeHtml(run.id)}">
            <header class="nearby-run-heading"><div><p class="eyebrow">⚽ RACHA ABERTO</p><h3>${escapeHtml(run.title)}</h3></div><strong class="nearby-run-spots">${openSpots} ${openSpots === 1 ? "vaga" : "vagas"}</strong></header>
            <div class="nearby-run-meta"><span>📅 ${escapeHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${run.date}T12:00:00`)))}</span><span>⏰ ${escapeHtml(run.time)}</span><span>${distance === null ? "📍 Distância indisponível" : `📍 ${distance < 10 ? distance.toFixed(1) : Math.round(distance)} km aprox.`}</span></div>
            <p class="nearby-run-venue">${escapeHtml(run.venue)}</p>
            <div class="nearby-run-footer"><strong>${escapeHtml(formatCurrency(run.fee))} <small>/ jogador</small></strong><div class="nearby-run-links">${routeLinks}</div></div>
            ${openSpots ? `<a class="primary run-participate-link" href="${escapeHtml(invitationUrl)}">⚽ Participar</a>` : '<button class="secondary-action run-participate-link" type="button" disabled>🔴 Vagas preenchidas</button>'}
            <button class="secondary-action run-invite-share-button" type="button" data-run-copy="${escapeHtml(run.id)}">📋 Copiar convite</button>
            <a class="secondary-action run-whatsapp-link" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp ↗</a>
            <label class="run-invite-link-label">Link de convite<input type="text" readonly value="${escapeHtml(invitationUrl)}" data-run-invite-link="${escapeHtml(run.id)}" aria-label="Link de convite para ${escapeHtml(run.title)}"></label>
            <details class="run-attendance-details"><summary>🟢 Confirmados ${counts.confirmed}/${run.capacity} · 🟡 Talvez ${counts.maybe} · 🔴 Não vai ${counts.declined} · ⏳ Não respondeu ${counts.pending}</summary><div class="run-attendance-list">${participants}</div></details>
            <p class="local-prototype-note">Protótipo: o link contém os dados deste jogo. Confirmações só chegam aqui quando o jogador envia a resposta de volta ao capitão.</p>
        </article>`;
    }

    function renderNearbyRuns() {
        const list = documentRef.querySelector("#nearby-runs-list");
        const status = documentRef.querySelector("#nearby-location-status");
        const upcoming = runs.filter(isUpcoming);
        const ordered = upcoming.map(run => ({
            run,
            distance: calculateDistanceKm(nearbyCoordinates, run.coordinates)
        })).sort((first, second) => {
            if (first.distance !== null && second.distance !== null && first.distance !== second.distance) {
                return first.distance - second.distance;
            }
            if (first.distance !== null) return -1;
            if (second.distance !== null) return 1;
            return `${first.run.date}${first.run.time}`.localeCompare(`${second.run.date}${second.run.time}`);
        });
        list.innerHTML = ordered.length ? ordered.map(({ run, distance }) => renderRunCard(run, distance)).join("")
            : '<p class="home-empty-note">Ainda não há rachas abertos com vagas. Crie um racha e convide a galera para começar.</p>';
        status.textContent = nearbyCoordinates
            ? "Distâncias aproximadas calculadas neste aparelho; sua localização não é enviada nem salva."
            : "Ative a localização para ordenar partidas. Sem coordenadas do local, a distância não pode ser calculada.";
    }

    function captureLocation({ onSuccess, statusElement }) {
        if (!windowRef.navigator.geolocation) {
            statusElement.textContent = "Este navegador não oferece acesso à localização.";
            showToast("Não foi possível acessar a localização neste navegador.");
            return;
        }
        statusElement.textContent = "Obtendo localização aproximada...";
        windowRef.navigator.geolocation.getCurrentPosition(position => {
            onSuccess({
                latitude: Math.round(position.coords.latitude * 1000) / 1000,
                longitude: Math.round(position.coords.longitude * 1000) / 1000
            });
        }, error => {
            console.warn("A localização não foi disponibilizada.", error);
            statusElement.textContent = "Localização indisponível. Confira a permissão do navegador e tente novamente.";
            showToast("Não foi possível obter a localização. Você ainda pode publicar o jogo sem distância.");
        }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
    }

    function captureRunLocation() {
        const statusElement = documentRef.querySelector("#run-location-status");
        captureLocation({
            statusElement,
            onSuccess: coordinates => {
                const runLocation = { ...coordinates };
                documentRef.querySelector("#run-location-status").textContent = `Ponto aproximado salvo neste aparelho (${runLocation.latitude.toFixed(3)}, ${runLocation.longitude.toFixed(3)}).`;
                documentRef.querySelector("#run-location-status").dataset.latitude = String(runLocation.latitude);
                documentRef.querySelector("#run-location-status").dataset.longitude = String(runLocation.longitude);
                documentRef.querySelector("#run-location-status").dataset.venue = documentRef.querySelector("#game-venue").value.trim();
            }
        });
    }

    function requestNearbyLocation() {
        captureLocation({
            statusElement: documentRef.querySelector("#nearby-location-status"),
            onSuccess: coordinates => {
                nearbyCoordinates = coordinates;
                renderNearbyRuns();
            }
        });
    }

    function publishRun(setup) {
        const capacity = Number(documentRef.querySelector("#run-capacity").value);
        if (!validDateAndTime(setup.date, setup.time) || !setup.venue) return showToast("Informe uma data, um horário e um local válidos antes de publicar o racha.");
        if (!Number.isInteger(capacity) || capacity < 2 || capacity > 50) return showToast("Informe entre 2 e 50 vagas para o racha.");
        if (new Date(`${setup.date}T${setup.time}`) < new Date()) return showToast("Escolha uma data e um horário futuros para publicar o racha.");
        const statusElement = documentRef.querySelector("#run-location-status");
        const sameVenue = statusElement.dataset.venue === setup.venue.trim();
        const latitude = sameVenue ? Number(statusElement.dataset.latitude) : NaN;
        const longitude = sameVenue ? Number(statusElement.dataset.longitude) : NaN;
        const invitedPlayers = [...documentRef.querySelectorAll('[name="runInvitePlayer"]:checked')]
            .map(input => players.find(player => player.id === input.value))
            .filter(Boolean)
            .map(player => ({ id: player.id, name: player.name, status: "pending" }));
        if (invitedPlayers.length > capacity) return showToast("A lista de convidados não pode exceder o número total de vagas.");
        const run = createOpenRun({
            setup,
            capacity,
            coordinates: validCoordinates({ latitude, longitude }) ? { latitude, longitude } : null,
            id: createId(),
            participants: invitedPlayers
        });
        if (!persistRuns([run, ...runs], "Não foi possível publicar o racha neste navegador. Libere espaço e tente novamente.")) return;
        renderNearbyRuns();
        documentRef.querySelector("#home-setup-details").open = true;
        documentRef.querySelector("#home-setup-details").scrollIntoView({ behavior: "smooth", block: "center" });
        showToast("Racha publicado neste navegador. Copie o convite ou compartilhe pelo WhatsApp.");
    }

    function renderIncomingInvite(invite) {
        receivedInvite = invite;
        const panel = documentRef.querySelector("#run-invitation-panel");
        if (!invite) {
            panel.hidden = true;
            return;
        }
        panel.hidden = false;
        documentRef.querySelector("#run-invitation-details").innerHTML = `<article class="invitation-summary"><p class="eyebrow">${escapeHtml(invite.title)}</p><h3>${escapeHtml(new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" }).format(new Date(`${invite.date}T12:00:00`)))}</h3><p>⏰ ${escapeHtml(invite.time)} · 📍 ${escapeHtml(invite.venue)}</p><strong>${escapeHtml(formatCurrency(invite.fee))} por jogador · até ${invite.capacity} pessoas</strong></article>`;
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderResponseShare(response, invite) {
        const responseUrl = buildRunResponseUrl(response, windowRef.location.href);
        const statusLabel = { confirmed: "Vou jogar", maybe: "Talvez", declined: "Não posso" }[response.status];
        const message = `Resposta para ${invite.title}: ${response.name} — ${statusLabel}.\nAbra este link no aparelho do capitão para registrar a resposta:\n${responseUrl}`;
        const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
        const share = documentRef.querySelector("#run-response-share");
        share.hidden = false;
        share.innerHTML = `<p class="run-response-confirmation">Resposta preparada. Envie ao capitão para registrar sua presença.</p><label>Link de resposta<input type="text" readonly value="${escapeHtml(responseUrl)}" id="run-response-link"></label><div class="run-response-actions"><button class="primary" type="button" id="copy-run-response">📋 Copiar link de resposta</button><a class="secondary-action" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">Enviar pelo WhatsApp ↗</a></div>`;
    }

    function submitInviteResponse(event) {
        if (event.target.id !== "run-invitation-form" || !receivedInvite) return;
        event.preventDefault();
        const form = event.currentTarget;
        const name = String(new FormData(form).get("name") || "").trim().replace(/\s+/g, " ").slice(0, 32);
        const status = String(new FormData(form).get("status") || "");
        if (!name || !["confirmed", "maybe", "declined"].includes(status)) return showToast("Informe seu nome e escolha uma resposta.");
        renderResponseShare({
            runId: receivedInvite.id,
            name,
            status,
            responseId: createId()
        }, receivedInvite);
    }

    function receiveInviteResponse(response) {
        if (!response) return false;
        const run = runs.find(item => item.id === response.runId);
        if (!run) {
            documentRef.querySelector("#nearby-location-status").textContent = "A resposta chegou, mas este navegador não tem a publicação correspondente. Abra o link de retorno no aparelho em que o capitão criou o racha.";
            showToast("Não encontrei este racha neste aparelho. Abra a resposta no aparelho do capitão.");
            return false;
        }
        const participantIndex = run.participants.findIndex(person =>
            person.id === response.responseId || person.name.toLocaleLowerCase("pt-BR") === response.name.toLocaleLowerCase("pt-BR")
        );
        const wasConfirmed = participantIndex >= 0 && run.participants[participantIndex].status === "confirmed";
        const alreadyIncluded = participantIndex >= 0;
        if (response.status === "confirmed" && getAttendanceCounts(run).confirmed >= run.capacity && !wasConfirmed) {
            showToast("As vagas estão preenchidas. A resposta não foi registrada como confirmada.");
            return false;
        }
        const nextRuns = runs.map(item => {
            if (item.id !== run.id) return item;
            const participants = [...item.participants];
            if (alreadyIncluded) participants[participantIndex] = { ...participants[participantIndex], ...response };
            else participants.push({ ...response, id: response.responseId });
            return { ...item, participants };
        });
        if (!persistRuns(nextRuns, "Não foi possível registrar a resposta neste navegador.")) return false;
        renderNearbyRuns();
        showToast(`Resposta de ${response.name} registrada no racha.`);
        return true;
    }

    function handleAttendanceChange(event) {
        const select = event.target.closest("[data-run-attendance]");
        if (!select) return;
        const run = runs.find(item => item.id === select.dataset.runAttendance);
        const person = run?.participants.find(participant => participant.id === select.dataset.runParticipant);
        if (!run || !person) return;
        const wasConfirmed = person.status === "confirmed";
        const isConfirming = select.value === "confirmed";
        if (!wasConfirmed && isConfirming && getAttendanceCounts(run).confirmed >= run.capacity) {
            select.value = person.status;
            return showToast("O limite de vagas confirmadas deste racha já foi atingido.");
        }
        const nextRuns = runs.map(item => item.id === run.id
            ? { ...item, participants: item.participants.map(participant => participant.id === person.id ? { ...participant, status: select.value } : participant) }
            : item);
        if (!persistRuns(nextRuns, "Não foi possível atualizar a lista de presença.")) return;
        renderNearbyRuns();
    }

    async function copyInputValue(input) {
        if (!input) return;
        try {
            if (!windowRef.navigator.clipboard?.writeText) throw new Error("A área de transferência não está disponível neste contexto.");
            await windowRef.navigator.clipboard.writeText(input.value);
            showToast("Link copiado.");
        } catch (error) {
            console.error("Não foi possível copiar o link do convite.", error);
            input.focus();
            input.select();
            showToast("Não foi possível copiar automaticamente. Selecione o link para copiá-lo.");
        }
    }

    function handleRunClick(event) {
        const copyInviteButton = event.target.closest("[data-run-copy]");
        if (copyInviteButton) {
            const input = documentRef.querySelector(`[data-run-invite-link="${CSS.escape(copyInviteButton.dataset.runCopy)}"]`);
            return copyInputValue(input);
        }
        if (event.target.closest("#copy-run-response")) {
            return copyInputValue(documentRef.querySelector("#run-response-link"));
        }
    }

    return {
        renderNearbyRuns,
        requestNearbyLocation,
        captureRunLocation,
        publishRun,
        renderIncomingInvite,
        submitInviteResponse,
        receiveInviteResponse,
        readInviteResponse: readRunResponse,
        readIncomingInvite: readRunLinkPayload,
        handleAttendanceChange,
        handleRunClick
    };
}
