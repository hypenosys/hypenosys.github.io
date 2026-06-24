/* ════════════════════════════════════════
   JULES PANEL STATE & CORE UTILITIES
   ════════════════════════════════════════ */

window.JulesPanelState = {
    activeRepo:          localStorage.getItem('hypenosys_active_repo') || null,
    activeBranch:        localStorage.getItem('hypenosys_active_branch') || null,
    activeSession:       null,
    pollingTimer:        null,
    hubActiveTab:        localStorage.getItem('hypenosys_hub_active_tab') || 'pull-requests',
    rateLimitRemaining:  999,
    requestQueue:        [],
    isDispatching:       false,
    isRefreshing:        false,
    isSyncingArchive:    false,
    currentView:         'dashboard',
    metricsWindow:       30,
    notifications:       [],
    unreadCount:         0,
    tasks:               [],
    linkedTaskId:        localStorage.getItem('jules_linked_task_id') || null,
    globalArchive:       {}
};

window.julesSourcesCache = [];
window.julesSessionsCache = [];
window.chatV2Messages = [];
window.currentSendMode = 'claude';
window.neuralPollInterval = null;
window.sessionPollInterval = null;

class GHAPIQueue {
    constructor() { this.queue = []; this.running = false; this.minInterval = 300; }
    enqueue(fn, priority = 1) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, priority, resolve, reject });
            this.queue.sort((a, b) => a.priority - b.priority);
            this.dispatch();
        });
    }
    async dispatch() {
        if (this.running || !this.queue.length) return;
        if (window.JulesPanelState.rateLimitRemaining <= 5 && this.queue[0].priority > 0) return;
        this.running = true;
        const { fn, resolve, reject } = this.queue.shift();
        try { const result = await fn(); resolve(result); } catch(e) { reject(e); }
        this.running = false;
        setTimeout(() => this.dispatch(), this.minInterval);
    }
}
window.GHQueue = new GHAPIQueue();

window.$ = function(id){return document.getElementById(id)};

window.showToast = function(msg, type='green'){
  const container = $('toast-wrap');
  if (!container) return;
  const t=document.createElement('div');
  t.className='toast'; t.style.borderColor = 'var(--' + type + ')';
  t.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>' + msg + '</span>';
  container.appendChild(t);
  requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('show')));
  setTimeout(()=>{t.classList.remove('show'); setTimeout(()=>t.remove(), 300)}, 3500);
}

window.addTel = function(tag, msg, type='info'){
  const d=new Date();
  const ts = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
  const box=$('tel-box'); if(!box) return;

  // Remove empty state message if it exists
  const emptyMsg = box.querySelector('.notif-empty');
  if (emptyMsg) emptyMsg.remove();

  const line=document.createElement('div');
  line.className = 'tel-line ' + type;
  line.innerHTML = '<div class="tel-head"><span class="tel-time">' + ts + '</span><span class="tel-tag ' + type + '">' + tag + '</span></div><div class="tel-msg">' + msg + '</div>';
  box.appendChild(line);
  box.scrollTop=box.scrollHeight;

  // Neural Loop: Add "Analizar con Claude" button to telemetry
  if (localStorage.getItem('hy_neural_active') === 'true') {
      const analyzer = document.createElement('button');
      analyzer.className = 'btn-ghost btn-sm';
      analyzer.style.marginTop = '4px';
      analyzer.style.fontSize = '9px';
      analyzer.style.padding = '2px 8px';
      analyzer.innerHTML = '✨ Analizar con Claude';
      analyzer.onclick = () => {
          const task = JSON.parse(localStorage.getItem('hy_neural_task_context') || '{}');
          let thread = JSON.parse(localStorage.getItem('hy_neural_thread') || '[]');
          const promptText = 'Jules ha reportado esto en la telemetría:\n[' + tag + '] ' + msg;
          const newMsg = {
              role: 'user',
              content: promptText,
              source: 'jules'
          };
          thread.push(newMsg);
          localStorage.setItem('hy_neural_thread', JSON.stringify(thread));

          localStorage.setItem('hy_neural_pending_prompt', newMsg.content + '\n\n¿Qué opinas? ¿Debo ajustar algo?');
          window.location.href = '/chat/neural/';
      };
      line.appendChild(analyzer);
  }

  // Broadcast activity to Neural Chat
  localStorage.setItem('jules_live_telemetry', JSON.stringify({
      tag, msg, type, timestamp: d.toISOString()
  }));
}

window.escapeHtml = function(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

window.getTimeAgo = function(dateStr) {
    const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return 'hace ' + Math.floor(interval) + ' años';
    interval = seconds / 2592000;
    if (interval > 1) return 'hace ' + Math.floor(interval) + ' meses';
    interval = seconds / 86400;
    if (interval > 1) return 'hace ' + Math.floor(interval) + ' días';
    interval = seconds / 3600;
    if (interval > 1) return 'hace ' + Math.floor(interval) + ' horas';
    interval = seconds / 60;
    if (interval > 1) return 'hace ' + Math.floor(interval) + ' min';
    return 'hace unos segundos';
}

window.updateRateLimit = function(remaining) {
    if (remaining === null || remaining === undefined) return;
    const count = parseInt(remaining, 10);
    window.JulesPanelState.rateLimitRemaining = count;
    if (count <= 10 && count > 0) showToast('⚠️ GitHub API: ' + count + ' peticiones restantes', 'amber');
    else if (count === 0) showToast('🚫 GitHub API: Rate limit alcanzado', 'red');
    window.dispatchEvent(new CustomEvent('ghRateLimitUpdate', { detail: { remaining: count } }));
}

window.getGitHubToken = function() {
    return sessionStorage.getItem('gh_access_token') || localStorage.getItem('gh_access_token') || localStorage.getItem('github_token') || null;
}

window.filterByStatus = function(status) {
    switchView('history');
    setTimeout(() => {
        const filterBtn = document.querySelector('.fpill[data-filter="' + status + '"]');
        if (filterBtn) filterBtn.click();
    }, 100);
}

window.toggleSidebar = function() {
    const sidebar = $('app-sidebar');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    localStorage.setItem('hy_sidebar_collapsed', isCollapsed);
}

window.toggleNavGroup = function(groupId) {
    const group = $(groupId);
    if (!group) return;
    const isCollapsed = group.classList.toggle('collapsed');
    const collapsedGroups = JSON.parse(localStorage.getItem('hy_nav_groups_collapsed') || '{}');
    collapsedGroups[groupId] = isCollapsed;
    localStorage.setItem('hy_nav_groups_collapsed', JSON.stringify(collapsedGroups));
}

// Restore nav group states on load
document.addEventListener('DOMContentLoaded', () => {
    const collapsedGroups = JSON.parse(localStorage.getItem('hy_nav_groups_collapsed') || '{}');
    Object.keys(collapsedGroups).forEach(id => {
        if (collapsedGroups[id]) {
            const el = $(id);
            if (el) el.classList.add('collapsed');
        }
    });
});

window.switchView = async function(view, navEl) {
    const isMobile = window.innerWidth < 768;

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-link, .mtab, .hnav-link').forEach(n => n.classList.remove('active'));

    if (view === 'dashboard' && !isMobile) {
      // Desktop Dashboard: show main views in layout
      $('view-dashboard').classList.add('active');
      $('view-config').classList.add('active');
      $('view-neural').classList.add('active');
      $('view-history').classList.add('active');

      // Re-insert views into dash-grid for desktop if not already there
      const grid = document.querySelector('#view-dashboard .dash-grid');
      if (grid) {
          grid.appendChild($('view-config'));
          grid.appendChild($('view-neural'));
          grid.appendChild($('view-history'));
      }
    } else {
      const target = $('view-' + view);
      if (target) {
          target.classList.add('active');
          // Move out of grid if it's mobile or specific view
          document.querySelector('.main').appendChild(target);
      }
    }

    if (navEl) {
      navEl.classList.add('active');
    } else {
      const sidebarLink = $('nav-' + view);
      if(sidebarLink) sidebarLink.classList.add('active');
      const headerLink = document.querySelector('.hnav-link[data-view="' + view + '"]');
      if(headerLink) headerLink.classList.add('active');
      const mobileTab = document.querySelector('.mtab[data-tab="' + view + '"]');
      if(mobileTab) mobileTab.classList.add('active');
    }

    window.JulesPanelState.currentView = view;
    if (view === 'kanban') { if (typeof refreshDashboard === 'function') refreshDashboard(); }
    if (view === 'metrics' || (view === 'dashboard' && !isMobile)) {
      renderMetrics();
      if (window.julesSessionsCache) renderHistoryTable(window.julesSessionsCache);
    }
    if (view === 'neural') {
        if($('v2-thinking-indicator')) $('v2-thinking-indicator').classList.add('hidden');
        renderChatV2Messages();
    }
    if (view === 'chat') {
        loadV2Messages();
        const sid = getLinkedJulesSessionId();
        if (sid && localStorage.getItem('hy_neural_active') === 'true') {
            startNeuralPolling(sid);
            const task = JSON.parse(localStorage.getItem('hy_neural_task_context') || '{}');
            if (task.id) showTaskContextInChat(task);
        }
        renderChatV2Messages();
    }
    if (view === 'hub') {
        const activeTab = localStorage.getItem('hypenosys_hub_active_tab') || 'pull-requests';
        const tabEl = document.querySelector('.dr-tab[data-tab="' + activeTab + '"]');
        switchHubTab(activeTab, tabEl);
    }
}

window.openMobileSidebar = function(){ $('app-sidebar').classList.add('mob-open'); $('sidebar-backdrop').classList.add('open'); }
window.closeMobileSidebar = function(){ $('app-sidebar').classList.remove('mob-open'); $('sidebar-backdrop').classList.remove('open'); }
window.openClaudeChat = function(){ $('claude-modal').classList.add('open'); }
window.closeClaudeChat = function(){ $('claude-modal').classList.remove('open'); }
window.openApiModal = function(){ window.authManager.showApiConfigModal(); }
window.closeApiModal = function(){ $('#modalApiConfig').modal('hide'); }
window.openDocs = function(){ alert("📚 Jules Agent V2 - Premium Neural Interface"); }

window.toggleNotifPanel = function() {
    const panel = $('notif-panel');
    if (!panel) return;
    const isOpen = panel.classList.toggle('open');
    if (isOpen) {
        renderNotifList();
        // Mark all as read when opening
        window.JulesPanelState.unreadCount = 0;
        updateNotifBadge();
    }
}

function renderNotifList() {
    const list = $('notif-list');
    if (!list) return;

    const notifs = JSON.parse(localStorage.getItem('hy_notifications') || '[]');
    if (notifs.length === 0) {
        list.innerHTML = '<div class="notif-empty">Sin notificaciones nuevas</div>';
        return;
    }

    list.innerHTML = notifs.map(n => {
        const time = getTimeAgo(n.timestamp);
        const icon = n.type === 'success' ? 'check-circle' : n.type === 'error' ? 'exclamation-circle' : 'info-circle';
        return '<div class="notif-item' + (n.unread ? ' unread' : '') + '">' +
               '<div class="notif-icon ' + n.type + '"><i class="fas fa-' + icon + '"></i></div>' +
               '<div class="notif-content">' +
               '<div class="notif-title">' + escapeHtml(n.title) + '</div>' +
               '<div class="notif-msg">' + escapeHtml(n.message) + '</div>' +
               '<div class="notif-time">' + time + '</div>' +
               '</div>' +
               '</div>';
    }).join('');
}

window.addNotification = function(title, message, type = 'info') {
    const notifs = JSON.parse(localStorage.getItem('hy_notifications') || '[]');
    const newNotif = {
        id: Date.now(),
        title,
        message,
        type,
        timestamp: new Date().toISOString(),
        unread: true
    };
    notifs.unshift(newNotif);
    // Keep only last 50
    localStorage.setItem('hy_notifications', JSON.stringify(notifs.slice(0, 50)));

    window.JulesPanelState.unreadCount++;
    updateNotifBadge();
    showToast(title, type);
}

function updateNotifBadge() {
    const count = window.JulesPanelState.unreadCount;
    const pips = document.querySelectorAll('#notif-pip, #mob-notif-pip');
    pips.forEach(pip => {
        pip.textContent = count;
        pip.classList.toggle('hidden', count === 0);
    });
}

window.clearNotifs = function() {
    localStorage.setItem('hy_notifications', '[]');
    window.JulesPanelState.unreadCount = 0;
    updateNotifBadge();
    renderNotifList();
}
