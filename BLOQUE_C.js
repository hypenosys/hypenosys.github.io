let sessionPollInterval = null;

function startPolling() {
    stopPolling();
    sessionPollInterval = setInterval(() => {
        if (!document.hidden) {
            refreshSessions();
        }
    }, 15000);
}

function stopPolling() {
    if (sessionPollInterval) clearInterval(sessionPollInterval);
}

document.addEventListener('visibilitychange', () => {
    document.hidden ? stopPolling() : startPolling();
});

window.addEventListener('beforeunload', stopPolling);
