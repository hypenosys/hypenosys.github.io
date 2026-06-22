/* ════════════════════════════════════════
   JULES PANEL METRICS & CHARTS
   ════════════════════════════════════════ */

window.loadJulesMetrics = async function() {
    try {
        const data = await window.julesApi.getSessions(100);
        const sessions = data.sessions || [];
        if (!sessions.length) return;
        const total = sessions.length;
        const completed = sessions.filter(s => s.state === "COMPLETED").length;
        const failed = sessions.filter(s => s.state === "FAILED" || s.state === "ERROR").length;
        const active = sessions.filter(s => ["WORKING", "IN_PROGRESS", "QUEUED", "PLANNING", "AWAITING_PLAN_APPROVAL"].includes(s.state)).length;
        const successRate = total > 0 ? Math.round((completed / (completed + failed || 1)) * 100) : 0;
        const totalTokens = sessions.reduce((acc, s) => acc + (s.usage?.totalTokens || 0), 0);
        if($("m-success-rate")) $("m-success-rate").textContent = `\${successRate}%`;
        if($("m-tokens")) $("m-tokens").textContent = totalTokens > 1000 ? `\${Math.round(totalTokens/1000)}k` : totalTokens;
        if($("s-total")) $("s-total").textContent = total;
        if($("s-active")) $("s-active").textContent = active;
        if($("leg-done")) $("leg-done").textContent = completed;
        if($("leg-running")) $("leg-running").textContent = sessions.filter(s => ["WORKING", "IN_PROGRESS"].includes(s.state)).length;
        if($("leg-error")) $("leg-error").textContent = failed;
        if($("leg-pending")) $("leg-pending").textContent = sessions.filter(s => s.state === "QUEUED" || s.state === "PLANNING").length;
        const doneP = (completed / total) * 100;
        const errorP = (failed / total) * 100;
        if($("donut-done")) $("donut-done").setAttribute("stroke-dasharray", `\${doneP} 100`);
        if($("donut-error")) {
            $("donut-error").setAttribute("stroke-dasharray", `\${errorP} 100`);
            $("donut-error").setAttribute("stroke-dashoffset", `-\${doneP}`);
        }
    } catch (e) {
        console.warn("[Jules] loadJulesMetrics error:", e);
    }
}

window.renderMetrics = function() {
    loadJulesMetrics();
}
