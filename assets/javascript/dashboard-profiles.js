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
  if (!grid || !currentProfiles || !currentProfiles.members) return;
  grid.innerHTML = '';

  const membersData = currentStats?.members || {};

  // Setup event delegation for the grid if not already done
  if (!grid._hasProfileListeners) {
    grid.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-action="edit-profile"]');
        if (editBtn) {
            e.stopPropagation();
            if (window.profileEditor) window.profileEditor.openModal();
            else if (window.authManager) window.authManager.showProfileModal();
            return;
        }

        const statsBtn = e.target.closest('[data-action="view-stats"]');
        if (statsBtn) {
            e.stopPropagation();
            const memberName = statsBtn.dataset.member;
            if (memberName) openDeepDiveModal(memberName);
            return;
        }
    });
    grid._hasProfileListeners = true;
  }

  Object.entries(currentProfiles.members).forEach(([name, profile]) => {
    const ghUser = (profile.github_username || '').toLowerCase();
    const isSelf = (window.currentUser && ghUser) ? window.currentUser === ghUser : false;
    const stats = membersData[ghUser] || membersData[name] || null;
    const avatarUrl = resolveAvatarUrl(profile);

    const card = document.createElement('div');
    card.id = `profile-card-${name.toLowerCase()}`;
    card.className = `bg-slate-900 border ${isSelf ? 'border-emerald-500 ring-1 ring-emerald-500 pulse-emerald' : 'border-slate-800'} rounded-2xl overflow-hidden relative group transition-all`;
    card.dataset.member = name;

    const completedAllTime = (stats && stats.completed) ? stats.completed.all_time || 0 : 0;
    const velocityDays = (stats && stats.avg_completion_speed) ? stats.avg_completion_speed.days || 0 : 0;
    const dependencyImpact = stats ? stats.dependency_impact || 0 : 0;
    const volatilityReopens = (stats && stats.volatility) ? stats.volatility.reopens || 0 : 0;

    card.innerHTML = `
      <div class="h-2" style="background-color: ${profile.color_accent}"></div>
      <div class="p-6">
        <div class="flex justify-between items-start mb-4">
          <div class="relative">
            <img src="${avatarUrl}" class="w-16 h-16 rounded-2xl border-2 border-slate-800 shadow-xl bg-slate-800 cursor-pointer hover:scale-105 transition-transform" onclick="event.stopPropagation(); openDeepDiveModal('${name}')">
            <div class="absolute -bottom-1 -right-1 bg-slate-900 rounded-full p-1 border border-slate-800">
                <div class="w-3 h-3 rounded-full bg-emerald-500 pulse-emerald"></div>
            </div>
          </div>
          <div class="flex gap-2">
              <button data-action="view-stats" data-member="${name}" class="p-2 bg-slate-950 rounded-lg text-indigo-400 hover:text-white border border-slate-800 transition-all text-xs font-bold flex items-center gap-2" title="Deep Dive">
                <i class="fa-solid fa-chart-line"></i>
              </button>
              ${isSelf ? `<button data-action="edit-profile" class="p-2 text-slate-500 hover:text-white transition-colors" title="Editar Mi Perfil"><i class="fa-solid fa-pencil"></i></button>` : ''}
          </div>
        </div>
        <h3 class="text-xl font-bold mb-1 text-white">${profile.display_name}</h3>
        <div class="text-[10px] text-emerald-400 font-bold uppercase tracking-wider mb-0">${profile.role || 'Sin Rol'}</div>
        <div class="text-[9px] text-purple-400 font-bold uppercase tracking-widest mb-3" style="font-size: 0.65rem;">${profile.lead_role || ''}</div>
        <p class="text-sm text-slate-400 leading-relaxed mb-4 h-12 overflow-hidden">${profile.bio || 'Sin biografía disponible.'}</p>

        ${stats ? `
        <div class="grid grid-cols-2 gap-2 mb-4 bg-slate-950/50 p-3 rounded-xl border border-slate-800 text-[10px] font-mono">
          <div class="text-slate-500">COMPLETADAS: <span class="text-emerald-400">${completedAllTime}</span></div>
          <div class="text-slate-500">VELOCITY: <span class="text-amber-400">${velocityDays}d</span></div>
          <div class="text-slate-500">IMPACTO: <span class="text-indigo-400">${dependencyImpact}</span></div>
          <div class="text-slate-500">VOLATILIDAD: <span class="text-red-400">${volatilityReopens}</span></div>
        </div>
        ` : ''}

        <div class="flex gap-3 text-slate-500">
          <a href="https://github.com/${profile.github_username}" target="_blank" onclick="event.stopPropagation()" class="hover:text-white"><i class="fa-brands fa-github"></i></a>
          ${profile.social?.twitter ? `<a href="https://twitter.com/${profile.social.twitter}" target="_blank" onclick="event.stopPropagation()" class="hover:text-white"><i class="fa-brands fa-twitter"></i></a>` : ''}
          ${profile.social?.itchio ? `<a href="https://itch.io/profile/${profile.social.itchio}" target="_blank" onclick="event.stopPropagation()" class="hover:text-white"><i class="fa-brands fa-itch-io"></i></a>` : ''}
          <button data-action="view-stats" data-member="${name}" class="ml-auto text-[10px] font-black text-indigo-400 hover:text-indigo-300 uppercase tracking-widest">VER STATS →</button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
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
