/**
 * Global Authentication and Header UI Manager
 */

class AuthManager {
    constructor() {
        this.clientId = 'Ov23liAVwbXNtvhkHJQe';
        this.init();
    }

    async init() {
        this.bindEvents();

        // Skip OAuth callback if we're on dashboard.html — let dashboard-data.js handle it
        // to avoid race conditions and double exchange.
        if (!window.location.pathname.includes('dashboard')) {
            await this.handleOAuthCallback();
        }

        await this.checkAuthState();
        
        const currentUser = window.githubApi.user || null;
        document.dispatchEvent(new CustomEvent('authReady', { 
            detail: { user: currentUser } 
        }));
    }

    bindEvents() {
        // Settings Modal: Save Button (Legacy - still useful for manual repo setting if needed)
        document.getElementById('btn-save-settings')?.addEventListener('click', () => this.handleSaveSettings());

        // Access Denied Modal: Logout Button
        document.getElementById('btn-logout-denied')?.addEventListener('click', () => this.handleLogout());

        // Header events are handled via data-attributes or dynamic injection
        document.addEventListener('click', (e) => {
            if (e.target.closest('#btn-sign-in')) {
                this.handleLogin();
            }
            if (e.target.closest('#btn-logout')) {
                this.handleLogout();
            }
            if (e.target.closest('#btn-open-settings') || e.target.closest('#btn-open-settings-dash')) {
                $('#settingsModal').modal('show');
            }
            if (e.target.closest('#btn-open-profile') || e.target.closest('#btn-open-profile-dash')) {
                this.showProfileModal();
            }
        });

        // Initialize modal inputs when shown
        $('#settingsModal').on('shown.bs.modal', () => {
            document.getElementById('input-pat').value = localStorage.getItem('github_token') || '';
            document.getElementById('input-repo').value = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';
            document.getElementById('input-jules-key-modal').value = localStorage.getItem('jules_api_key') || '';
        });

        // Profile Modal Save
        document.getElementById('btn-save-profile')?.addEventListener('click', () => this.handleSaveProfile());
    }

    async handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            window.history.replaceState({}, document.title, window.location.pathname);
            this.showToast('Autenticando...', 'Intercambiando código con el gatekeeper...', 'info');
            
            try {
                const result = await window.githubApi.exchangeCodeForToken(code);
                if (result.valid) {
                    this.updateHeaderUI(result.user);
                    this.showToast('Éxito', 'Sesión iniciada correctamente.', 'success');
                } else {
                    this.handleAuthError({ status: result.user ? 403 : 401, type: result.user ? 'ACL_DENIED' : 'INVALID' });
                }
            } catch (e) {
                console.error('[AUTH] Exchange failed:', e);
                this.showToast('Error', 'Fallo en la autenticación OAuth.', 'error');
            }
        }
    }

    async checkAuthState() {
        const token = window.githubApi.getAuthToken();
        if (!token) {
            this.updateHeaderUI(null);
            return;
        }

        // Prevent infinite reload loops
        const lastAttempt = parseInt(sessionStorage.getItem('auth_last_attempt') || '0');
        const now = Date.now();
        if (now - lastAttempt < 2000) {
            console.warn('[AuthManager] Deteniendo posible bucle de redirección/validación.');
            return;
        }
        sessionStorage.setItem('auth_last_attempt', now.toString());

        try {
            const result = await window.githubApi.validateToken();
            if (result.valid) {
                this.updateHeaderUI(result.user);
                if (document.getElementById('dream-team-container')) {
                    await this.renderDreamTeamComponent();
                }
            } else {
                // If token exists but is invalid, clear and show UI
                this.handleAuthError({
                    status: result.user ? 403 : 401,
                    type: result.user ? 'ACL_DENIED' : 'INVALID'
                });
            }
        } catch (e) {
            this.handleAuthError(e);
        }
    }

    handleLogin() {
        // Prefer dashboard checkbox if present, then header checkbox
        const chkDashboard = document.getElementById('chk-remember-me-dashboard');
        const chkHeader = document.getElementById('chk-remember-me');
        const rememberMe = (chkDashboard ? chkDashboard.checked : (chkHeader ? chkHeader.checked : false));

        sessionStorage.setItem('auth_remember_me', rememberMe);

        const scope = 'repo';
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${this.clientId}&scope=${scope}`;
    }

    async handleSaveSettings() {
        const btn = document.getElementById('btn-save-settings');
        const originalHtml = btn.innerHTML;

        const token = document.getElementById('input-pat').value.trim();
        const repo = document.getElementById('input-repo').value.trim();
        const julesKey = document.getElementById('input-jules-key-modal').value.trim();

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Conectando...';

        try {
            // 1. Validar Token de GitHub (si se proporciona)
            if (token) window.githubApi.setToken(token);
            window.githubApi.setRepo(repo);
            const user = await window.githubApi.validateToken();
            this.updateHeaderUI(user);

            // 2. Validar Jules API Key (Obligatorio para guardar/conectar)
            if (!julesKey) {
                throw new Error("Se requiere una Jules API Key para conectar con el agente de IA.");
            }

            try {
                // Intentamos una llamada mínima a Jules para validar la clave
                await window.julesApiCall('GET', '/sources', null, julesKey);
                localStorage.setItem('jules_api_key', julesKey);
            } catch (julesErr) {
                console.error("Jules validation failed:", julesErr);
                throw new Error("Jules API Key inválida o error de conexión: " + julesErr.message);
            }

            // Si todo OK, cerramos y notificamos
            $('#settingsModal').modal('hide');
            this.showToast('Éxito', 'Conexión establecida con GitHub y Jules.', 'success');

            // Dispatch event for other components (like Jules Panel) to refresh
            document.dispatchEvent(new CustomEvent('settingsSaved'));

            if (window.location.pathname.includes('dashboard') || window.location.pathname.includes('jules-panel')) {
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (e) {
            console.error("Save settings failed:", e);
            this.showToast('Error de Conexión', e.message, 'error');
            // NO cerramos el modal si hay error
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    showSettingsModal() {
        $('#settingsModal').modal('show');
    }

    handleAuthError(e) {
        // Clear session on security-related errors
        if (e.status === 401 || (e.status === 403 && e.type === 'ACL_DENIED') || e.type === 'INVALID') {
            window.githubApi.clearAuth();
            this.updateHeaderUI(null);
        }

        if (e.status === 403 && e.type === 'ACL_DENIED') {
            const msgEl = document.getElementById('access-denied-message');
            if (msgEl) msgEl.innerText = "Autenticado con éxito en GitHub, pero no tienes autorización explícita de la facción Hypenosys. Acceso revocado.";

            if (window.jQuery && window.jQuery.fn.modal) {
                $('#settingsModal').modal('hide');
                $('#accessDeniedModal').modal('show');
            }

            // For dashboard compatibility
            const dashUnauthorized = document.getElementById('unauthorized-overlay');
            if (dashUnauthorized) dashUnauthorized.classList.remove('hidden');

        } else if (e.status === 401 || e.type === 'INVALID') {
            this.showToast('Sesión Expirada', 'Tu token es inválido o ha caducado. Por favor, vuelve a iniciar sesión.', 'error');

            // Show login overlay if on dashboard
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) loginOverlay.classList.remove('hidden');
        } else {
            this.showToast('Error', e.message || 'Ocurrió un error inesperado.', 'error');
        }
    }

    handleLogout() {
        window.githubApi.clearAuth();
        window.location.reload();
    }

    updateHeaderUI(user) {
        const container = document.getElementById('auth-nav-container');
        const leftContainer = document.getElementById('auth-nav-container-left');

        // Support both Landing Page (Bootstrap) and Dashboard (Tailwind/Custom)
        const isDashboard = !!document.getElementById('user-status');

        if (!container && !isDashboard) return;

        // ─── FIX: guard contra user incompleto
        if (user && !user.login) {
            console.warn('[AuthManager] updateHeaderUI llamado con user sin login:', user);
            return;
        }

        if (user) {
            if (leftContainer) leftContainer.innerHTML = '';

            const dropdownHtml = `
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        <span class="mr-2 d-none d-lg-inline text-gray-400 small font-weight-mono">${user.login}</span>
                        <div class="position-relative">
                            ${window.HypenosysUI.renderAvatar(user)}
                            <span class="connectivity-dot"></span>
                        </div>
                    </a>
                    <div class="dropdown-menu dropdown-menu-right shadow animated--grow-in bg-dark border-purple" aria-labelledby="userDropdown">
                        <a class="dropdown-item text-white" href="#" id="btn-open-profile">
                            <i class="fas fa-user fa-sm fa-fw mr-2 text-purple"></i>
                            Mi Perfil
                        </a>
                        <a class="dropdown-item text-white" href="#" id="btn-open-settings">
                            <i class="fas fa-cog fa-sm fa-fw mr-2 text-purple"></i>
                            Ajustes Avanzados
                        </a>
                        <div class="dropdown-divider border-purple"></div>
                        <a class="dropdown-item text-white" href="#" id="btn-logout">
                            <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-purple"></i>
                            Cerrar Sesión
                        </a>
                    </div>
                </li>
            `;

            if (container) {
                container.innerHTML = dropdownHtml;
            }

            // Dashboard integration
            if (isDashboard) {
                const dashboardUserStatus = document.getElementById('user-status');
                const dashboardUserStatusMobile = document.getElementById('user-status-mobile');
                const dashHtml = `
                    <div class="dropdown">
                        <button class="flex items-center gap-3 focus:outline-none" id="userDropdownDash" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                            <div class="hidden lg:flex flex-col items-end">
                                <span class="text-[10px] font-bold text-white leading-none">${user.login}</span>
                                <span class="text-[9px] text-emerald-500 font-mono">ONLINE</span>
                            </div>
                            <div class="pulse-emerald rounded-full">
                                ${window.HypenosysUI.renderAvatar(user)}
                            </div>
                        </button>
                        <div class="dropdown-menu dropdown-menu-right shadow animated--grow-in bg-dark border-purple" aria-labelledby="userDropdownDash" style="background-color: #1a1a1a;">
                            <a class="dropdown-item text-white" href="#" id="btn-open-profile-dash">
                                <i class="fas fa-user fa-sm fa-fw mr-2 text-purple"></i> Mi Perfil
                            </a>
                            <a class="dropdown-item text-white" href="#" id="btn-open-settings-dash">
                                <i class="fas fa-cog fa-sm fa-fw mr-2 text-purple"></i> Ajustes
                            </a>
                            <div class="dropdown-divider border-purple"></div>
                            <a class="dropdown-item text-white" href="#" id="btn-logout-dash">
                                <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-purple"></i> Logout
                            </a>
                        </div>
                    </div>
                `;
                if (dashboardUserStatus) dashboardUserStatus.innerHTML = dashHtml;
                if (dashboardUserStatusMobile) dashboardUserStatusMobile.innerHTML = dashHtml;
            }
        } else {
            if (leftContainer) leftContainer.innerHTML = '';
            container.innerHTML = `
                <li class="nav-item d-flex align-items-center">
                    <div class="custom-control custom-checkbox mr-3 d-none d-md-block">
                        <input type="checkbox" class="custom-control-input" id="chk-remember-me">
                        <label class="custom-control-label text-gray-400 small" for="chk-remember-me" style="cursor:pointer">Remember me</label>
                    </div>
                    <button id="btn-sign-in" class="btn btn-outline-purple btn-sm ml-lg-1 mt-1 mt-lg-0">
                        <i class="fa-brands fa-github mr-1"></i> Log in with GitHub
                    </button>
                </li>
            `;
        }
    }

    // --- Profile Editing and Team Rendering ---

    async renderDreamTeamComponent() {
        const container = document.getElementById('dream-team-container');
        if (!container) return;

        try {
            const profiles = await window.githubApi.fetchProfiles();
            const members = Object.entries(profiles.members);
            
            container.innerHTML = members.map(([name, profile]) => `
                <div class="col-lg-4 col-md-6 mb-4" data-member="${name}">
                    <div class="card h-100 team-card shadow-sm" style="border-top: 3px solid ${profile.color_accent || 'transparent'}">
                        <div class="team-img-container">
                            <img src="${profile.avatar_url || 'https://github.com/' + profile.github_username + '.png'}" class="card-img-top team-img" alt="${profile.display_name}">
                        </div>
                        <div class="card-body d-flex flex-column">
                            <h4 class="card-title text-purple font-weight-bold">${(profile.display_name || name).toUpperCase()}</h4>
                            <div class="role-tag mb-1 small text-white-50">${profile.role || ''}</div>
                            <div class="lead-role-tag mb-3 x-small text-purple font-weight-bold uppercase" style="font-size: 0.7rem;">${profile.lead_role || ''}</div>
                            <p class="card-text flex-grow-1 text-light small">${profile.bio || ''}</p>
                            <div class="mt-3">
                                ${(profile.skills || []).map(skill => `<span class="badge badge-skill mr-1 mb-1">${skill}</span>`).join('')}
                            </div>
                            <div class="mt-4 pt-3 border-top border-dark d-flex flex-wrap">
                                <a href="https://github.com/${profile.github_username}" class="btn btn-sm btn-outline-purple mr-2 mb-2" target="_blank">GitHub</a>
                                ${profile.portfolio_url ? `<a href="${profile.portfolio_url}" class="btn btn-sm btn-outline-purple mr-2 mb-2" target="_blank">Portfolio</a>` : ''}
                                ${(profile.extra_links || []).map(link => `<a href="${link.url}" class="btn btn-sm btn-outline-purple mr-2 mb-2" target="_blank">${link.label}</a>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('Failed to render team component:', e);
        }
    }

    async showProfileModal(targetMemberName = null) {
        if (!window.githubApi.user) return;
        
        const login = window.githubApi.user.login;
        this.showToast('Cargando...', 'Obteniendo perfiles del equipo...', 'info');
        
        try {
            const profiles = await window.githubApi.fetchProfiles();
            const members = profiles.members;
            
            // Find current user's profile
            const currentUserEntry = Object.entries(members).find(([k, v]) => v.github_username.toLowerCase() === login.toLowerCase());
            if (!currentUserEntry) {
                this.showToast('Aviso', 'Tu GitHub no está vinculado a ningún perfil de equipo.', 'warning');
                return;
            }

            const currentUserProfile = currentUserEntry[1];
            const isLandingAdmin = currentUserProfile.is_admin === true;
            
            // Determine who we are editing
            let memberName = targetMemberName || currentUserEntry[0];
            let profile = members[memberName];

            if (!profile) {
                this.showToast('Error', `Perfil de ${memberName} no encontrado.`, 'error');
                return;
            }

            // Populate Modal
            document.getElementById('profile-modal-title').textContent = (memberName === currentUserEntry[0]) ? 'EDITAR MI PERFIL' : `EDITANDO PERFIL DE: ${memberName.toUpperCase()}`;
            document.getElementById('edit-profile-avatar-preview').src = profile.avatar_url || `https://github.com/${profile.github_username}.png`;
            document.getElementById('edit-profile-name').value = profile.display_name || '';
            document.getElementById('edit-profile-role').value = profile.role || '';
            document.getElementById('edit-profile-lead-role').value = profile.lead_role || '';
            document.getElementById('edit-profile-desc').value = profile.bio || '';
            document.getElementById('edit-profile-portfolio').value = profile.portfolio_url || '';
            document.getElementById('edit-profile-color').value = profile.color_accent || '#bd93f9';
            document.getElementById('edit-profile-color-hex').value = (profile.color_accent || '#bd93f9').toUpperCase();
            document.getElementById('edit-profile-skills').value = (profile.skills || []).join(', ');
            document.getElementById('edit-profile-twitter').value = profile.social?.twitter || '';
            document.getElementById('edit-profile-itch').value = profile.social?.itchio || '';
            document.getElementById('input-jules-key').value = localStorage.getItem('jules_api_key') || '';
            
            if (window.profileEditUI) {
                window.profileEditUI.setExtraLinks(profile.extra_links || []);
            }

            // Admin Logic
            const adminContainer = document.getElementById('admin-member-selector-container');
            if (isLandingAdmin && adminContainer) {
                adminContainer.classList.remove('hidden');
                const select = document.getElementById('admin-member-select');
                select.innerHTML = Object.keys(members).map(m => `<option value="${m}" ${m === memberName ? 'selected' : ''}>${m}</option>`).join('');
                select.onchange = (e) => this.showProfileModal(e.target.value);
            } else if (adminContainer) {
                adminContainer.classList.add('hidden');
            }

            this.editingMemberName = memberName;
            $('#profileModal').modal('show');
        } catch (e) {
            console.error(e);
            this.showToast('Error', 'No se pudo cargar el perfil: ' + e.message, 'error');
        }
    }

    async handleSaveProfile() {
        if (!this.editingMemberName) return;

        const name = document.getElementById('edit-profile-name').value.trim();
        const role = document.getElementById('edit-profile-role').value.trim();
        const leadRole = document.getElementById('edit-profile-lead-role').value.trim();
        const desc = document.getElementById('edit-profile-desc').value.trim();
        const portfolio = document.getElementById('edit-profile-portfolio').value.trim();
        const color = document.getElementById('edit-profile-color').value;
        const skillsStr = document.getElementById('edit-profile-skills').value;
        const twitter = document.getElementById('edit-profile-twitter').value.trim();
        const itch = document.getElementById('edit-profile-itch').value.trim();
        const julesKey = document.getElementById('input-jules-key').value.trim();

        if (julesKey) localStorage.setItem('jules_api_key', julesKey);
        else localStorage.removeItem('jules_api_key');

        if (!name || !role) {
            this.showToast('Error', 'Nombre y Rol son campos obligatorios.', 'error');
            return;
        }

        const btn = document.getElementById('btn-save-profile');
        const originalHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';

        try {
            const profileDelta = {
                display_name: name,
                role: role,
                lead_role: leadRole,
                bio: desc,
                portfolio_url: portfolio,
                color_accent: color,
                skills: skillsStr.split(',').map(s => s.trim()).filter(s => s),
                social: {
                    twitter: twitter,
                    itchio: itch
                },
                extra_links: window.profileEditUI ? window.profileEditUI.getExtraLinks() : []
            };

            await window.githubApi.updateMemberProfile(this.editingMemberName, profileDelta);
            
            this.showToast('Éxito', 'Perfil actualizado correctamente. Sincronizando UI...', 'success');
            $('#profileModal').modal('hide');
            
            // Global UI refresh strategy
            if (window.refreshDashboardData) {
                await window.refreshDashboardData();
            } else if (document.getElementById('dream-team-container')) {
                await this.renderDreamTeamComponent();
            }
        } catch (e) {
            console.error(e);
            this.showToast('Error', 'Fallo al guardar: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    showToast(title, message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `custom-toast ${type}`;
        toast.innerHTML = `
            <div class="toast-header">
                <strong class="mr-auto">${title}</strong>
                <button type="button" class="ml-2 mb-1 close" data-dismiss="toast">&times;</button>
            </div>
            <div class="toast-body">${message}</div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            $(toast).fadeOut(500, () => toast.remove());
        }, 5000);

        $(toast).find('.close').on('click', () => toast.remove());
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});
