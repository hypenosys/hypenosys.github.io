function switchView(view, navEl) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));

    const target = $(`view-${view}`);
    if (target) target.classList.add('active');
    if (navEl) navEl.classList.add('active');

    window.JulesPanelState.currentView = view;

    if (view === 'kanban') refreshSessions();
    if (view === 'metrics') renderMetrics();
}
