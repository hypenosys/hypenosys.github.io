function renderMetrics() {
    const sessions = window.julesSessionsCache || [];
    if (!sessions.length) return;

    const windowSize = window.JulesPanelState.metricsWindow || 30;
    const sample = sessions.slice(0, windowSize);

    const total = sample.length;
    const success = sample.filter(s => s.state === 'COMPLETED').length;
    const successRate = Math.round((success / total) * 100);

    const tokens = sample.reduce((acc, s) => acc + (s.usage?.totalTokens || 0), 0);

    if($('m-success-rate')) $('m-success-rate').textContent = `${successRate}%`;
    if($('m-tokens')) $('m-tokens').textContent = `${Math.round(tokens/1000)}k`;

    // Dist breakdown
    const states = {
        'done': sample.filter(s => s.state === 'COMPLETED').length,
        'running': sample.filter(s => s.state === 'IN_PROGRESS').length,
        'error': sample.filter(s => s.state === 'FAILED').length,
        'pending': sample.filter(s => s.state === 'QUEUED' || s.state === 'PLANNING').length
    };

    if($('leg-done')) $('leg-done').textContent = states.done;
    if($('leg-running')) $('leg-running').textContent = states.running;
    if($('leg-error')) $('leg-error').textContent = states.error;
    if($('leg-pending')) $('leg-pending').textContent = states.pending;
}
