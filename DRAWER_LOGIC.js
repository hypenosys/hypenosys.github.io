async function refreshActivities(sessionId) {
    const container = $('dr-term');
    if (!container) return;

    try {
        const data = await window.julesApi.getActivities(sessionId, 50);
        const activities = data.activities || [];

        container.innerHTML = activities.map(a => {
            let cls = 'tline ';
            let txt = a.description || '';

            if (a.progressUpdated) { cls += 'agent'; txt = a.progressUpdated.title; }
            else if (a.planGenerated) { cls += 'sys'; txt = 'Plan generado'; }
            else if (a.planApproved) { cls += 'git'; txt = 'Plan aprobado'; }
            else if (a.sessionFailed) { cls += 'err'; txt = `ERROR: ${a.sessionFailed.reason}`; }

            return `<div class="${cls}">${escapeHtml(txt)}</div>`;
        }).join('') || '<div class="tline sys">Sin actividades registradas</div>';

        container.scrollTop = container.scrollHeight;
    } catch (e) {
        container.innerHTML = `<div class="tline err">Error al cargar actividades: ${e.message}</div>`;
    }
}
