export function createPaymentsController({
    documentRef,
    windowRef,
    matches,
    saveMatches,
    renderHome,
    showToast,
    formatCurrency,
    formatMatchDate,
    escapeHtml
}) {
    function renderPayments() {
        documentRef.querySelector("#reset-payments").disabled = matches.length === 0;
        documentRef.querySelector("#pay-all").disabled = matches.length === 0;
        const pendingCount = matches.reduce((total, match) => total + match.participants.filter(participant => !match.payments[participant.id]).length, 0);
        const paidTotal = matches.reduce((total, match) => total + match.participants.filter(participant => match.payments[participant.id]).length * (Number(match.fee) || 0), 0);
        documentRef.querySelector("#payments-summary").innerHTML = `<article><span>Em aberto</span><strong>${pendingCount} ${pendingCount === 1 ? "pagamento" : "pagamentos"}</strong></article><article><span>Recebido</span><strong>${formatCurrency(paidTotal)}</strong></article>`;
        const paymentsList = documentRef.querySelector("#payments-list");
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

    function setAllPayments(paid) {
        const action = paid ? "marcar todos os pagamentos como pagos" : "zerar os pagamentos e deixá-los pendentes";
        if (!windowRef.confirm(`Deseja ${action} em todas as partidas?`)) return;
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

    function handlePaymentClick(event) {
        const button = event.target.closest("[data-payment-match]");
        if (!button) return;
        const match = matches.find(item => item.id === button.dataset.paymentMatch);
        if (!match || !Object.hasOwn(match.payments, button.dataset.paymentPlayer)) return;
        match.payments[button.dataset.paymentPlayer] = !match.payments[button.dataset.paymentPlayer];
        saveMatches();
        renderPayments();
        renderHome();
    }

    return { renderPayments, setAllPayments, handlePaymentClick };
}
