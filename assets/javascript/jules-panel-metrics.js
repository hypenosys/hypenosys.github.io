/* ════════════════════════════════════════
   JULES PANEL METRICS
   ════════════════════════════════════════ */

async function renderMetrics() {
    try {
        const sessions = window.julesSessionsCache || [];
        const total = sessions.length;
        const active = sessions.filter(s => !['COMPLETED','FAILED','CANCELLED','ERROR'].includes(s.state)).length;

        const done = sessions.filter(s => s.state === 'COMPLETED').length;
        const failed = sessions.filter(s => s.state === 'FAILED' || s.state === 'ERROR').length;

        const doneP = total > 0 ? (done / total) * 100 : 0;
        const errorP = total > 0 ? (failed / total) * 100 : 0;

        if($('m-active')) $('m-active').innerText = active;
        if($('m-total')) $('m-total').innerText = total;
        if($('m-repos')) $('m-repos').innerText = (window.julesSourcesCache || []).length;

        const branches = new Set(sessions.map(s => s.sourceContext?.githubRepoContext?.startingBranch).filter(Boolean));
        if($('m-branches')) $('m-branches').innerText = branches.size;

        // Update charts if present
        if($("donut-done")) $("donut-done").setAttribute("stroke-dasharray", doneP + " 100");
        if($("donut-error")) {
            $("donut-error").setAttribute("stroke-dasharray", errorP + " 100");
            $("donut-error").setAttribute("stroke-dashoffset", "-" + doneP);
        }

        // Remove skeletons
        const metricsCard = document.querySelector('.card--metrics');
        if (metricsCard) {
            metricsCard.querySelectorAll('.skeleton').forEach(s => s.classList.remove('skeleton', 'skeleton--loading'));
        }

    } catch (e) {
        console.error("Error rendering metrics:", e);
    }
}
