/* ════════════════════════════════════════
   JULES PANEL METRICS
   ════════════════════════════════════════ */

async function renderMetrics() {
    try {
        const sessions = window.julesSessionsCache || [];
        const total = sessions.length;

        // Normalización y descubrimiento de estados dinámicos
        const isActive = (state) => {
            if (!state) return false;
            const s = state.toUpperCase().trim();
            return s.includes('PLANNING') || s.includes('EXECUTING') || s.includes('RUNNING') || s.includes('IN_PROGRESS');
        };
        const isDone = (state) => state && state.toUpperCase().trim() === 'COMPLETED';
        const isFailed = (state) => {
            if (!state) return false;
            const s = state.toUpperCase().trim();
            return s === 'FAILED' || s === 'ERROR' || s === 'CANCELLED';
        };

        const active = sessions.filter(s => isActive(s.state)).length;
        const done = sessions.filter(s => isDone(s.state)).length;
        const failed = sessions.filter(s => isFailed(s.state)).length;
        const pending = total - active - done - failed;

        if($('m-active')) $('m-active').innerText = active;
        if($('m-total')) $('m-total').innerText = total;
        if($('m-repos')) $('m-repos').innerText = (window.julesSourcesCache || []).length;

        const branches = new Set(sessions.map(s => (s.sourceContext && s.sourceContext.githubRepoContext && s.sourceContext.githubRepoContext.startingBranch)).filter(Boolean));
        if($('m-branches')) $('m-branches').innerText = branches.size;

        // Update Summary Stats on Metrics Page
        if ($('m-success-rate')) {
            const rate = total > 0 ? Math.round((done / total) * 100) : 0;
            $('m-success-rate').innerText = rate + '%';
        }
        if ($('m-tokens')) {
            // Simplified mock for tokens
            $('m-tokens').innerText = (total * 1.2).toFixed(1) + 'k';
        }

        // Update Donut Chart
        if ($('donut-chart')) {
            const doneP = total > 0 ? (done / total) * 100 : 0;
            const runningP = total > 0 ? (active / total) * 100 : 0;
            const errorP = total > 0 ? (failed / total) * 100 : 0;
            const pendingP = total > 0 ? (pending / total) * 100 : 0;

            if ($('donut-done')) $('donut-done').setAttribute('stroke-dasharray', doneP + ' 100');
            if ($('donut-running')) {
                $('donut-running').setAttribute('stroke-dasharray', runningP + ' 100');
                $('donut-running').setAttribute('stroke-dashoffset', '-' + doneP);
            }
            if ($('donut-error')) {
                $('donut-error').setAttribute('stroke-dasharray', errorP + ' 100');
                $('donut-error').setAttribute('stroke-dashoffset', '-' + (doneP + runningP));
            }
            if ($('donut-pending')) {
                $('donut-pending').setAttribute('stroke-dasharray', pendingP + ' 100');
                $('donut-pending').setAttribute('stroke-dashoffset', '-' + (doneP + runningP + errorP));
            }

            if ($('leg-done')) $('leg-done').innerText = done;
            if ($('leg-running')) $('leg-running').innerText = active;
            if ($('leg-error')) $('leg-error').innerText = failed;
            if ($('leg-pending')) $('leg-pending').innerText = pending;
        }

        // Render Bar Chart: Sessions per day (last 7 days)
        renderSessionsByDayChart(sessions);

        // Render Token Timeline
        renderTokenTimeline(sessions);

        // Remove skeletons
        document.querySelectorAll('.skeleton, .skeleton-stat').forEach(function(el) {
            el.classList.remove('skeleton', 'skeleton-stat', 'skeleton-text');
        });

    } catch (e) {
        console.error("Error rendering metrics:", e);
    }
}

function renderSessionsByDayChart(sessions) {
    const container = $('bar-sessions');
    if (!container) return;

    const days = {};
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        days[d.toISOString().split('T')[0]] = 0;
    }

    sessions.forEach(s => {
        const date = s.createTime.split('T')[0];
        if (days[date] !== undefined) days[date]++;
    });

    const max = Math.max(...Object.values(days), 5);

    container.innerHTML = Object.keys(days).map(date => {
        const count = days[date];
        const h = (count / max * 100) || 5;
        const dayLabel = date.split('-').pop();
        return '<div class="bar-wrap">' +
               '<div class="bar token-bar" style="height:' + h + '%" title="' + count + ' sesiones"></div>' +
               '<div class="bar-label">' + dayLabel + '</div>' +
               '</div>';
    }).join('');
}

function renderTokenTimeline(sessions) {
    const container = $('token-timeline');
    if (!container) return;

    const last7 = sessions.slice(0, 7);
    const maxTokens = 50000; // Mock max

    container.innerHTML = last7.map(s => {
        const sid = s.name.split('/').pop();
        const tokens = Math.floor(Math.random() * 30000) + 5000; // Mock tokens
        const pct = (tokens / maxTokens * 100);
        return '<div class="timeline-row">' +
               '<div class="tl-time">#' + sid + '</div>' +
               '<div class="tl-bar-outer"><div class="tl-bar-inner token-bar" style="width:' + pct + '%; background:var(--accent)"></div></div>' +
               '<div class="tl-val">' + (tokens / 1000).toFixed(1) + 'k</div>' +
               '</div>';
    }).join('');
}
