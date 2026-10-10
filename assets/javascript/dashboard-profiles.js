/* HYPENOSYS — PROFILES MODULE */

/**
 * Resolves avatar URL based on production rules:
 * 1. avatar_url if it starts with http
 * 2. https://github.com/<username>.png?size=200
 * 3. assets/images/upload_soul.svg
 */
function resolveAvatarUrl(profile) {
  if (profile.avatar_url && profile.avatar_url.startsWith('http')) {
    return profile.avatar_url;
  }
  if (profile.github_username) {
    return `https://github.com/${profile.github_username}.png?size=200`;
  }
  return 'assets/images/upload_soul.svg';
}

function renderTeamProfiles() {
  const grid = document.getElementById('team-profiles-grid');
  if (!grid || !currentProfiles?.members) return;
  const workspace = window.githubApi?.getActiveWorkspace?.() || 'hypenosys';
  const org = (window.__workspaces__ || []).find(o => o.id === workspace);
  const self = String(window.currentUser || window.githubApi?.user?.login || '').toLowerCase();
  const handles = workspace === 'personal' ? [self].filter(Boolean)
    : (org?.members || []).map(m => String(typeof m === 'string' ? m : m?.handle || '').toLowerCase()).filter(Boolean);
  const profiles = Object.entries(currentProfiles.members);
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const members = [...new Set(handles)].map(handle => {
    const match = profiles.find(([_, p]) =>
      String(p.github_username || p.github_login || '').toLowerCase() === handle);
    return match || [handle, { github_username: handle, display_name: handle, role: 'Miembro', bio: '' }];
  });
  grid.replaceChildren();
  if (!members.length) {
    grid.innerHTML = '<p class="text-sm text-slate-400 p-4">Sin miembros visibles en este espacio de trabajo.</p>';
    return;
  }

  // Delegation survives every redraw; profile names and descriptions come from
  // team_profiles.json, never the GitHub session display name.
  if (!grid._hasProfileListeners) {
    grid.addEventListener('click', event => {
      const edit = event.target.closest('[data-action="edit-profile"]');
      if (edit) {
        event.stopPropagation();
        window.authManager?.showProfileModal();
        return;
      }
      const stats = event.target.closest('[data-action="view-stats"]');
      if (stats) {
        event.stopPropagation();
        if (stats.dataset.member) openDeepDiveModal(stats.dataset.member);
      }
    });
    grid._hasProfileListeners = true;
  }

  for (const [key, profile] of members) {
    const ghUser = String(profile.github_username || profile.github_login || key).toLowerCase();
    const stats = currentStats?.members?.[ghUser] || null;
    const avatar = resolveAvatarUrl(profile);
    const avatarUrl = /^https:\/\//i.test(avatar || '') ? avatar : '/assets/images/upload_soul.svg';
    const accent = /^#[0-9a-f]{6}$/i.test(profile.color_accent || '') ? profile.color_accent : '#bd93f9';
    const name = escapeHtml(profile.display_name || key);
    const role = escapeHtml(profile.role || 'Sin rol');
    const leadRole = escapeHtml(profile.lead_role || '');
    const bio = escapeHtml(profile.bio || 'Sin biografía disponible.');
    const memberKey = escapeHtml(key);
    const done = stats?.completed?.all_time ?? 0;
    const velocity = stats?.avg_completion_speed?.days ?? 0;
    const impact = stats?.dependency_impact ?? 0;
    const reopens = stats?.volatility?.reopens ?? 0;
    const card = document.createElement('div');
    card.id = 'profile-card-' + key.toLowerCase();
    card.dataset.member = key;
    card.className = 'bg-slate-900 border ' + (self === ghUser ? 'border-emerald-500' : 'border-slate-800')
      + ' rounded-2xl overflow-hidden relative group transition-all';
    card.innerHTML = `
      <div class="h-2" style="background-color:${accent}"></div>
      <div class="p-5">
        <div class="flex justify-between items-start mb-4">
          <button type="button" data-action="view-stats" data-member="${memberKey}" aria-label="Ver estadísticas de ${name}">
            <img src="${escapeHtml(avatarUrl)}" alt="" class="w-16 h-16 rounded-2xl border-2 border-slate-800 bg-slate-800" loading="lazy">
          </button>
          <div class="flex gap-2">
            <button type="button" data-action="view-stats" data-member="${memberKey}" class="p-2 text-indigo-400" aria-label="Ver estadísticas de ${name}">Stats</button>
            ${self === ghUser ? '<button type="button" data-action="edit-profile" class="p-2 text-emerald-400" aria-label="Editar mi perfil">Editar</button>' : ''}
          </div>
        </div>
        <h3 class="text-xl font-bold mb-1 text-white">${name}</h3>
        <div class="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-1">${role}</div>
        <div class="text-[10px] text-purple-400 font-bold uppercase mb-3">${leadRole}</div>
        <p class="text-sm text-slate-400 leading-relaxed mb-4">${bio}</p>
        <div class="grid grid-cols-2 gap-2 mb-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-[10px] font-mono">
          <div>Completadas: <strong class="text-emerald-400">${done}</strong></div>
          <div>Tiempo medio: <strong class="text-amber-400">${velocity}d</strong></div>
          <div>Impacto: <strong class="text-indigo-400">${impact}</strong></div>
          <div>Reaperturas: <strong class="text-red-400">${reopens}</strong></div>
        </div>
        <a class="text-purple-400 text-sm" target="_blank" rel="noopener noreferrer" href="https://github.com/${encodeURIComponent(ghUser)}">GitHub: ${escapeHtml(ghUser)}</a>
      </div>`;
    grid.appendChild(card);
  }
}

// Attach to window for global access (used in auth.js handleSaveProfile)
window.renderTeamProfiles = renderTeamProfiles;

// Removed toggleProfileEdit and saveProfileEdit as they are replaced by the unified AuthManager modal

function scrollToProfile(memberName) {
  const card = document.getElementById(`profile-card-${memberName.toLowerCase()}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('ring-4', 'ring-indigo-500', 'ring-offset-4', 'ring-offset-slate-950');
    setTimeout(() => {
      card.classList.remove('ring-4', 'ring-indigo-500', 'ring-offset-4', 'ring-offset-slate-950');
    }, 3000);
  }
}

let currentDeepDiveMember = null;

function openDeepDiveModal(memberName) {
    const profile = currentProfiles?.members[memberName];
    if (!profile) return;
    currentDeepDiveMember = memberName;

    const ghUser = (profile.github_username || profile.handle || '').toLowerCase();
    const stats = currentStats?.members[ghUser] || currentStats?.members[memberName] || null;
    const avatarUrl = resolveAvatarUrl(profile);

    // Header
    document.getElementById('deep-dive-name').textContent = profile.display_name;
    document.getElementById('deep-dive-role').textContent = profile.role || 'Sin Rol';
    document.getElementById('deep-dive-avatar').innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover">`;

    // Tab: Profile
    document.getElementById('deep-dive-bio').textContent = profile.bio || 'Sin biografía disponible.';
    const skillsContainer = document.getElementById('deep-dive-skills');
    skillsContainer.innerHTML = '';
    const skills = profile.skills || [];
    skills.forEach(skill => {
        const span = document.createElement('span');
        span.className = 'px-2 py-1 bg-slate-800 border border-slate-700 rounded text-[10px] font-bold text-slate-300';
        span.textContent = skill;
        skillsContainer.appendChild(span);
    });

    const linksContainer = document.getElementById('deep-dive-links');
    linksContainer.innerHTML = '';
    if (profile.links.github) linksContainer.innerHTML += `<a href="${profile.links.github}" target="_blank" class="hover:text-white transition-colors"><i class="fa-brands fa-github"></i></a>`;
    if (profile.links.twitter) linksContainer.innerHTML += `<a href="${profile.links.twitter}" target="_blank" class="hover:text-white transition-colors"><i class="fa-brands fa-twitter"></i></a>`;
    if (profile.links.itch) linksContainer.innerHTML += `<a href="${profile.links.itch}" target="_blank" class="hover:text-white transition-colors"><i class="fa-brands fa-itch-io"></i></a>`;

    // Tab: Performance
    if (stats) {
        const completed = stats.completed || {};
        const avgSpeed = stats.avg_completion_speed || {};
        const workload = stats.workload || {};
        const volatility = stats.volatility || {};

        document.getElementById('perf-completed-all').textContent = completed.all_time || 0;
        document.getElementById('perf-completed-milestone').textContent = `${completed.milestone || 0} este milestone`;

        const velocity = avgSpeed.days || 0;
        const spVelocity = (completed.all_time > 0) ? ((workload.story_points || 0) / (avgSpeed.days || 1)).toFixed(1) : "0.0";
        document.getElementById('perf-velocity').textContent = avgSpeed.estimated_start ? `~${velocity}d` : `${velocity}d`;

        document.getElementById('perf-impact').textContent = stats.dependency_impact || 0;
        document.getElementById('perf-comments').textContent = stats.comment_activity || 0;
        document.getElementById('perf-reopens').textContent = volatility.reopens || 0;
        document.getElementById('perf-repriorities').textContent = volatility.reprioritizations || 0;
        document.getElementById('perf-active-tasks').textContent = workload.active_tasks || 0;
        document.getElementById('perf-active-sp').textContent = `${workload.story_points || 0} SP`;

        // Badges
        renderMemberBadges(stats);
    }

    // Default to Profile tab
    switchDeepDiveTab('profile');

    document.getElementById('member-deep-dive-modal').classList.remove('hidden');
}

// Attach to window for global access from onclick handlers
window.openDeepDiveModal = openDeepDiveModal;

function closeDeepDiveModal() {
    document.getElementById('member-deep-dive-modal').classList.add('hidden');
}

function switchDeepDiveTab(tab) {
    const isProfile = tab === 'profile';
    document.getElementById('deep-dive-tab-profile').classList.toggle('hidden', !isProfile);
    document.getElementById('deep-dive-tab-performance').classList.toggle('hidden', isProfile);

    const btnProfile = document.getElementById('tab-btn-profile');
    const btnPerf = document.getElementById('tab-btn-performance');

    if (isProfile) {
        btnProfile.className = 'px-4 py-1.5 text-xs font-bold rounded-lg transition-all bg-indigo-500 text-white shadow-lg';
        btnPerf.className = 'px-4 py-1.5 text-xs font-bold rounded-lg transition-all text-slate-400 hover:text-white';
    } else {
        btnPerf.className = 'px-4 py-1.5 text-xs font-bold rounded-lg transition-all bg-indigo-500 text-white shadow-lg';
        btnProfile.className = 'px-4 py-1.5 text-xs font-bold rounded-lg transition-all text-slate-400 hover:text-white';
        // Initialize charts when tab becomes visible
        setTimeout(renderMemberPerformanceCharts, 50);
    }
}

function renderMemberPerformanceCharts() {
    const profile = currentProfiles?.members[currentDeepDiveMember];
    if (!profile) return;
    const ghUser = (profile.github_username || '').toLowerCase();
    const stats = currentStats?.members[ghUser] || currentStats?.members[currentDeepDiveMember] || null;
    if (!stats) return;

    const ctxVel = document.getElementById('member-velocity-chart').getContext('2d');
    const ctxType = document.getElementById('member-type-chart').getContext('2d');
    const ctxRama = document.getElementById('member-rama-chart').getContext('2d');

    const weeklyVelocity = stats.weekly_velocity || {};
    if (memberVelocityChart) memberVelocityChart.destroy();
    memberVelocityChart = new Chart(ctxVel, {
        type: 'bar',
        data: {
            labels: Object.keys(weeklyVelocity),
            datasets: [{
                label: 'SP Velocity',
                data: Object.values(weeklyVelocity),
                backgroundColor: 'rgba(99, 102, 241, 0.8)',
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#64748b', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, beginAtZero: true }
            }
        }
    });

    const typeBreakdown = stats.type_breakdown || {};
    if (memberTypeChart) memberTypeChart.destroy();
    memberTypeChart = new Chart(ctxType, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeBreakdown),
            datasets: [{
                data: Object.values(typeBreakdown),
                backgroundColor: ['#6366f1', '#34d399', '#fbbf24', '#f87171', '#a78bfa'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });

    const ramaBreakdown = stats.rama_breakdown || {};
    if (memberRamaChart) memberRamaChart.destroy();
    memberRamaChart = new Chart(ctxRama, {
        type: 'polarArea',
        data: {
            labels: Object.keys(ramaBreakdown),
            datasets: [{
                data: Object.values(ramaBreakdown),
                backgroundColor: ['rgba(99, 102, 241, 0.5)', 'rgba(52, 211, 153, 0.5)', 'rgba(251, 191, 36, 0.5)', 'rgba(248, 113, 113, 0.5)'],
                borderColor: '#1e293b',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { display: false } }
            },
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 } } }
            }
        }
    });
}

function renderMemberBadges(stats) {
    const container = document.getElementById('deep-dive-badges');
    container.innerHTML = '';

    const badges = getAvailableBadges(stats);

    if (badges.length === 0) {
        container.innerHTML = '<div class="text-[10px] text-slate-600 italic">Gana badges completando tareas y colaborando con el equipo.</div>';
        return;
    }

    badges.forEach(b => {
        const div = document.createElement('div');
        div.className = `flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-indigo-500/30 text-indigo-400 rounded-full text-[10px] font-black uppercase tracking-widest shadow-lg`;
        div.innerHTML = `<span>${b.icon}</span> ${b.label}`;
        container.appendChild(div);
    });
}

function getAvailableBadges(stats) {
    const badges = [];
    if (!stats) return badges;

    const completed = stats.completed || {};
    const avgSpeed = stats.avg_completion_speed || {};
    const typeBreakdown = stats.type_breakdown || {};

    if ((stats.dependency_impact || 0) >= 5) badges.push({ icon: '🔗', label: 'Unblocker' });
    if ((typeBreakdown['bug'] || 0) >= 10) badges.push({ icon: '🐛', label: 'Bug Slayer' });
    if ((avgSpeed.days || 999) <= 2 && (completed.all_time || 0) >= 5) badges.push({ icon: '⚡', label: 'Velocity King' });
    if ((stats.comment_activity || 0) >= 10) badges.push({ icon: '💬', label: 'Collaborator' });
    if ((typeBreakdown['research'] || 0) >= 3) badges.push({ icon: '🧪', label: 'Researcher' });

    // Tag intelligence
    const tagFrequency = stats.tag_frequency || {};
    const sortedTags = Object.entries(tagFrequency).sort((a,b) => b[1] - a[1]);
    if (sortedTags.length > 0) {
        const [topTag, count] = sortedTags[0];
        if (count >= 3) {
            badges.push({ icon: '🔥', label: `${topTag.charAt(0).toUpperCase() + topTag.slice(1)} Spec` });
        }
    }
    return badges;
}

function getDistinctiveBadge(stats) {
    if (!stats || !stats.completed) return null;
    const badges = getAvailableBadges(stats);
    return badges.length > 0 ? badges[0] : null;
}
