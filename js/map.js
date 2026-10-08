export function createMapSearchUrl(location) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export function createMapDirectionsUrl(location) {
    return `https://waze.com/ul?q=${encodeURIComponent(location)}&navigate=yes`;
}

export function renderLocationPreview(location, escapeHtml) {
    const query = typeof location === "string" ? location.trim().slice(0, 200) : "";
    if (!query) {
        return '<p class="location-empty">Informe o local para ver o mapa e as opções de rota.</p>';
    }

    return `<section class="location-preview" data-location-query="${escapeHtml(query)}" aria-label="Local da partida">
        <div class="location-map-frame" data-location-map-frame hidden></div>
        <div class="location-map-placeholder" data-location-map-placeholder aria-hidden="true"><span class="location-map-road location-map-road-one"></span><span class="location-map-road location-map-road-two"></span><span class="location-map-pin">📍</span><span class="location-map-label">MAPA DA PARTIDA</span></div>
        <div class="location-preview-details"><div><span class="eyebrow">LOCAL DA PARTIDA</span><strong>${escapeHtml(query)}</strong></div><div class="location-actions"><button class="secondary-action" type="button" data-location-load-map>Carregar mapa</button><a href="${createMapSearchUrl(query)}" target="_blank" rel="noopener noreferrer">Abrir no Google Maps ↗</a><a href="${createMapDirectionsUrl(query)}" target="_blank" rel="noopener noreferrer">Como chegar no Waze ↗</a></div></div>
    </section>`;
}

export function handleLocationMapClick(event, documentRef = globalThis.document) {
    const button = event.target.closest("[data-location-load-map]");
    if (!button) return false;
    const preview = button.closest("[data-location-query]");
    const frame = preview?.querySelector("[data-location-map-frame]");
    const placeholder = preview?.querySelector("[data-location-map-placeholder]");
    if (!preview || !frame || !placeholder) return false;

    if (!frame.querySelector("iframe")) {
        const iframe = documentRef.createElement("iframe");
        iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(preview.dataset.locationQuery)}&output=embed`;
        iframe.title = `Mapa de ${preview.dataset.locationQuery}`;
        iframe.loading = "lazy";
        iframe.referrerPolicy = "strict-origin-when-cross-origin";
        iframe.setAttribute("allowfullscreen", "");
        frame.append(iframe);
    }
    frame.hidden = false;
    placeholder.hidden = true;
    button.hidden = true;
    return true;
}
