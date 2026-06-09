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

        const isDashboard = window.location.pathname.includes('dashboard');
        const isJules = window.location.pathname.includes('jules-panel');
        const isClaude = window.location.pathname.includes('claude-chat') || window.location.pathname.includes('cloude-chat');

        if (isDashboard || isJules || isClaude) {
            console.log('[AUTH] Protected page detected. Handling OAuth callback if present...');

            try {
                const result = await this.handleOAuthCallback();
                if (result) {
                    console.log('[AUTH] OAuth exchange successful via AuthManager');
                    document.dispatchEvent(new CustomEvent('authReady', {
                        detail: { user: result.user }
                    }));
                    return;
                }
            } catch (e) {
                console.error('[AUTH] OAuth exchange failed in init:', e);
                return;
            }

            console.log('[AUTH] No OAuth code or exchange completed. Checking existing session...');
            await this.checkAuthState();

            setTimeout(() => {
                document.dispatchEvent(new CustomEvent('authReady', {
                    detail: { user: window.githubApi.user || null }
                }));
            }, 50);
            return;
        }

        await this.handleOAuthCallback();
        await this.checkAuthState();

        const currentUser = window.githubApi.user || null;
        document.dispatchEvent(new CustomEvent('authReady', {
            detail: { user: currentUser }
        }));
    }

    bindEvents() {
        document.getElementById('btn-save-settings')?.addEventListener('click', () => this.handleSaveSettings());
        document.getElementById('btn-logout-denied')?.addEventListener('click', () => this.handleLogout());
        document.getElementById('btn-save-api-config')?.addEventListener('click', () => this.handleSaveApiConfig());

        document.addEventListener('click', (e) => {
            if (e.target.closest('#btn-sign-in')) this.handleLogin();
            if (e.target.closest('#btn-logout')) this.handleLogout();
            if (e.target.closest('#btn-open-settings')) $('#settingsModal').modal('show');
            if (e.target.closest('#btn-open-profile')) this.showProfileModal();
            if (e.target.closest('#btn-open-api-config')) this.showApiConfigModal();
        });

        $('#settingsModal').on('shown.bs.modal', () => {
            document.getElementById('input-pat').value = localStorage.getItem('github_token') || '';
            document.getElementById('input-repo').value = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';
            document.getElementById('input-jules-key-modal').value = localStorage.getItem('jules_api_key') || '';
        });

        document.getElementById('btn-save-profile')?.addEventListener('click', () => this.handleSaveProfile());
    }

    /**
     * FIX: Se implementó un bloqueo global (window._oauthExchanging) y limpieza inmediata
     * de la URL para prevenir bucles de redirección infinitos. El guard de las páginas
     * protegidas ahora detecta el parámetro 'code' y espera a que este proceso termine
     * antes de rebotar al index.
     */
    async handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        if (code) {
            if (window._oauthExchanging) {
                console.log('[AUTH] OAuth exchange already in progress, skipping duplicate.');
                return null;
            }
            window._oauthExchanging = true;

            console.log('[AUTH] Consuming OAuth code...');
            // Limpiar la URL inmediatamente para evitar re-procesamientos
            window.history.replaceState({}, document.title, window.location.pathname);

            this.showToast('Autenticando...', 'Intercambiando código con el gatekeeper...', 'info');
            try {
                const result = await window.githubApi.exchangeCodeForToken(code);
                if (result.valid) {
                    this.updateHeaderUI(result.user);
                    this.showToast('Éxito', 'Sesión iniciada correctamente.', 'success');
                    return result; // Retornar resultado para coordinar con dashboard-data.js
                } else {
                    const err = {
                        status: result.user ? 403 : 401,
                        type: result.user ? 'ACL_DENIED' : 'INVALID',
                        message: result.user ? 'Usuario no autorizado' : 'Token inválido'
                    };
                    this.handleAuthError(err);
                    throw err;
                }
            } catch (e) {
                console.error('[AUTH] Exchange failed:', e);
                this.showToast('Error', 'Fallo en la autenticación OAuth: ' + (e.message || 'Error desconocido'), 'error');

            // En páginas protegidas, simplemente limpiar y disparar authReady con null
            // para que los gates locales tomen el control en lugar de redirigir al home.
            window.githubApi.clearAuth();
            document.dispatchEvent(new CustomEvent('authReady', {
                detail: { user: null }
            }));

                throw e;
            } finally {
                // No reseteamos _oauthExchanging para evitar que otros disparadores lo intenten de nuevo
                // ya que el código ya fue consumido y la URL limpiada.
            }
        }
        return null;
    }

    async checkAuthState() {
        const token = window.githubApi.getAuthToken();
        if (!token) {
            this.updateHeaderUI(null);
            return;
        }

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
            } else {
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
        const chkDashboard = document.getElementById('chk-remember-me-dashboard');
        const chkHeader = document.getElementById('chk-remember-me');
        const chkJules = document.getElementById('chk-remember-me-jules');
        const rememberMe = (chkDashboard?.checked || chkHeader?.checked || chkJules?.checked || false);
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
            if (token) window.githubApi.setToken(token);
            window.githubApi.setRepo(repo);
            const user = await window.githubApi.validateToken();
            this.updateHeaderUI(user);

            if (!julesKey) throw new Error("Se requiere una Jules API Key para conectar con el agente de IA.");

            try {
                await window.julesApiCall('GET', '/sources', null, julesKey);
                localStorage.setItem('jules_api_key', julesKey);
            } catch (julesErr) {
                console.error("Jules validation failed:", julesErr);
                throw new Error("Jules API Key inválida o error de conexión: " + julesErr.message);
            }

            $('#settingsModal').modal('hide');
            this.showToast('Éxito', 'Conexión establecida con GitHub y Jules.', 'success');

            // Dispatch events
            document.dispatchEvent(new CustomEvent('settingsSaved'));
            window.dispatchEvent(new Event('tokenUpdated'));

            // No reload, surgical update instead
            if (window.location.pathname.includes('jules-panel')) {
                if (typeof window.initializeRepoSelector === 'function') {
                    window.initializeRepoSelector();
                }
            }
        } catch (e) {
            console.error("Save settings failed:", e);
            this.showToast('Error de Conexión', e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
    }

    showSettingsModal() {
        $('#settingsModal').modal('show');
    }

    handleAuthError(e) {
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

            const dashUnauthorized = document.getElementById('unauthorized-overlay');
            if (dashUnauthorized) dashUnauthorized.classList.remove('hidden');

        } else if (e.status === 401 || e.type === 'INVALID') {
            this.showToast('Sesión Expirada', 'Tu token es inválido o ha caducado. Por favor, vuelve a iniciar sesión.', 'error');
            const loginOverlay = document.getElementById('login-overlay');
            if (loginOverlay) loginOverlay.classList.remove('hidden');
        } else {
            this.showToast('Error', e.message || 'Ocurrió un error inesperado.', 'error');
        }
    }

    logout() {
        this.handleLogout();
    }

    handleLogout() {
        window.githubApi.clearAuth();
        window.location.reload();
    }

    updateHeaderUI(user) {
        // Compatibility with new Dashboard header
        if (typeof window.renderUserStatus === 'function' && (document.getElementById('user-status') || document.getElementById('user-status-mobile'))) {
            window.renderUserStatus(user);
            return;
        }

        const container = document.getElementById('auth-nav-container') || document.getElementById('user-status');
        const leftContainer = document.getElementById('auth-nav-container-left') || document.getElementById('user-status-mobile');
        const chkHeader = document.getElementById('chk-remember-me');

        if (chkHeader && chkHeader.parentElement) {
            chkHeader.parentElement.remove(); // Remove legacy checkbox UI
        }

        if (!container) return;

        if (user && !user.login) {
            console.warn('[AuthManager] updateHeaderUI llamado con user sin login:', user);
            return;
        }

        if (user) {
            if (leftContainer) leftContainer.innerHTML = '';
            container.innerHTML = `
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
                            <i class="fas fa-user fa-sm fa-fw mr-2 text-purple"></i> Mi Perfil
                        </a>
                        <a class="dropdown-item text-white" href="#" id="btn-open-api-config">
                            <i class="fas fa-key fa-sm fa-fw mr-2 text-purple"></i> Configuración API
                        </a>
                        <a class="dropdown-item text-white" href="#" id="btn-open-settings">
                            <i class="fas fa-cog fa-sm fa-fw mr-2 text-purple"></i> Ajustes Avanzados
                        </a>
                        <div class="dropdown-divider border-purple"></div>
                        <a class="dropdown-item text-white" href="#" id="btn-logout">
                            <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-purple"></i> Cerrar Sesión
                        </a>
                    </div>
                </li>
            `;
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

    async renderDreamTeamComponent() {
        const container = document.getElementById('dream-team-container');
        if (!container) return;
        try {
            const response = await fetch('/_data/team.json');
            const team = await response.json();
            container.innerHTML = team.map(member => `
                <div class="col-lg-4 col-md-6 mb-4">
                    <div class="card h-100 team-card shadow-sm">
                        <div class="team-img-container">
                            <img src="${member.image}" class="card-img-top team-img" alt="${member.name}">
                        </div>
                        <div class="card-body d-flex flex-column">
                            <h4 class="card-title text-purple font-weight-bold">${member.name.toUpperCase()}</h4>
                            <div class="role-tag mb-3 small">${member.role}</div>
                            <p class="card-text flex-grow-1 text-light">${member.description}</p>
                            <div class="mt-3">
                                ${member.skills.map(skill => `<span class="badge badge-skill mr-1 mb-1">${skill}</span>`).join('')}
                            </div>
                            <div class="mt-4 pt-3 border-top border-dark d-flex flex-wrap">
                                ${member.github ? `<a href="${member.github}" class="btn btn-sm btn-outline-purple mr-2 mb-2" target="_blank">GitHub</a>` : ''}
                                ${member.portfolio ? `<a href="${member.portfolio}" class="btn btn-sm btn-outline-purple mr-2 mb-2" target="_blank">Portfolio</a>` : ''}
                                ${(member.extra_links || []).map(link => `<a href="${link.url}" class="btn btn-sm btn-outline-purple mr-2 mb-2" target="_blank">${link.name}</a>`).join('')}
                            </div>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('Failed to render team component:', e);
        }
    }

    async showProfileModal() {
        if (!window.githubApi.user) return;
        const login = window.githubApi.user.login;
        this.showToast('Cargando...', 'Obteniendo datos del equipo...', 'info');
        try {
            const fileData = await window.githubApi.getFile('_data/team.json');
            const team = JSON.parse(decodeURIComponent(escape(atob(fileData.content))));
            const member = team.find(m => m.github && m.github.toLowerCase().includes(login.toLowerCase()));
            if (!member) {
                this.showToast('Aviso', 'No se encontró tu perfil en el archivo team.json.', 'warning');
                return;
            }
            document.getElementById('edit-profile-name').value = member.name || '';
            document.getElementById('edit-profile-role').value = member.role || '';
            document.getElementById('edit-profile-desc').value = member.description || '';
            document.getElementById('edit-profile-portfolio').value = member.portfolio || '';
            document.getElementById('input-jules-key').value = localStorage.getItem('jules_api_key') || '';
            this.currentTeamData = team;
            this.currentFileSha = fileData.sha;
            this.currentMemberIndex = team.indexOf(member);
            $('#profileModal').modal('show');
        } catch (e) {
            this.showToast('Error', 'No se pudo cargar el perfil para editar.', 'error');
        }
    }


    async handleSaveProfile() {
        const name = document.getElementById('edit-profile-name').value.trim();
        const role = document.getElementById('edit-profile-role').value.trim();
        const desc = document.getElementById('edit-profile-desc').value.trim();
        const portfolio = document.getElementById('edit-profile-portfolio').value.trim();
        const julesKey = document.getElementById('input-jules-key').value.trim();

        if (julesKey) {
            localStorage.setItem('jules_api_key', julesKey);
        } else {
            localStorage.removeItem('jules_api_key');
        }

        if (!name || !role) {
            this.showToast('Error', 'Nombre y Rol son campos obligatorios.', 'error');
            return;
        }

        const btn = document.getElementById('btn-save-profile');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';

        try {
            const login = window.githubApi.user.login;
            const profilesRes = await window.githubApi.fetchFileWithSha('_data/team_profiles.json');
            const profiles = profilesRes.content.members;
            const memberEntry = Object.entries(profiles).find(([k, v]) => v.github_username.toLowerCase() === login.toLowerCase());
            if (!memberEntry) throw new Error("No se encontró perfil de equipo vinculado a este GitHub.");

            const memberName = memberEntry[0];
            const profileDelta = { display_name: name, role, bio: desc, portfolio };
            await window.githubApi.updateMemberProfile(memberName, profileDelta);

            // Propagate changes to dashboard if present
            if (window.currentProfiles && window.currentProfiles.members[memberName]) {
                window.currentProfiles.members[memberName] = {
                    ...window.currentProfiles.members[memberName],
                    ...profileDelta,
                    display_name: name, // map display_name to display_name
                    bio: desc           // map bio to bio
                };
                if (typeof window.renderTeamProfiles === 'function') {
                    window.renderTeamProfiles();
                }
            }

            this.showToast('Éxito', 'Cambios guardados. La homepage se actualizará en ~1-2 min tras el build de GitHub Pages.', 'success');
            $('#profileModal').modal('hide');
            await this.renderDreamTeamComponent();
        } catch (e) {
            console.error(e);
            this.showToast('Error', 'Fallo al guardar los cambios: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Guardar Cambios';
        }
    }

    async showApiConfigModal() {
        if (!window.githubApi.user) {
            this.showToast('Error', 'Debes estar autenticado para configurar la API.', 'error');
            return;
        }

        const login = window.githubApi.user.login;
        let config = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');

        // Fallback to team_profiles.json if localStorage is empty for provider/model
        if (!config.provider || !config.model) {
            try {
                const profilesRes = await window.githubApi.fetchFileWithSha('_data/team_profiles.json');
                const profiles = profilesRes.content.members;
                const memberEntry = Object.values(profiles).find(v => v.github_username.toLowerCase() === login.toLowerCase());
                if (memberEntry && memberEntry.ai_config) {
                    config.provider = config.provider || memberEntry.ai_config.provider;
                    config.model = config.model || memberEntry.ai_config.model;
                }
            } catch (e) {
                console.warn('[AuthManager] No se pudo cargar team_profiles para fallback de API config:', e);
            }
        }

        document.getElementById('ai_provider').value = config.provider || 'none';
        document.getElementById('ai_model').value = config.model || '';
        document.getElementById('ai_api_key').value = config.api_key || '';
        document.getElementById('ai_base_url').value = config.base_url || '';
        document.getElementById('ai_local_network').checked = !!config.local_network;

        if (window.ollamaUI) {
            window.ollamaUI.handleProviderChange();
        }
        $('#modalApiConfig').modal('show');
    }

    async handleSaveApiConfig() {
        if (!window.githubApi.user) return;
        const login = window.githubApi.user.login;

        const provider = document.getElementById('ai_provider').value;
        const model = document.getElementById('ai_model').value.trim();
        const apiKey = document.getElementById('ai_api_key').value.trim();
        const baseUrl = document.getElementById('ai_base_url').value.trim();
        const localNetwork = document.getElementById('ai_local_network').checked;

        const btn = document.getElementById('btn-save-api-config');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';

        try {
            // Save sensitive + all to localStorage
            const localConfig = { provider, model, api_key: apiKey, base_url: baseUrl, local_network: localNetwork };
            localStorage.setItem('hy_ai_config', JSON.stringify(localConfig));

            // Sync non-sensitive to team_profiles.json via safe public wrapper
            const profilesRes = await window.githubApi.fetchFileWithSha('_data/team_profiles.json');
            const memberEntry = Object.entries(profilesRes.content.members).find(([k, v]) => v.github_username.toLowerCase() === login.toLowerCase());

            if (memberEntry) {
                const memberName = memberEntry[0];
                await window.githubApi.updateMemberAiConfig(memberName, { provider, model });
            }

            if (window.hypeToast) {
                window.hypeToast('Configuración API guardada ✓', 'success');
            } else {
                this.showToast('Éxito', 'Configuración API guardada correctamente.', 'success');
            }
            $('#modalApiConfig').modal('hide');
        } catch (e) {
            console.error(e);
            if (window.hypeToast) {
                window.hypeToast('Error al guardar. Inténtalo de nuevo.', 'error');
            } else {
                this.showToast('Error', 'Fallo al guardar la configuración: ' + e.message, 'error');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Guardar Configuración';
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
        setTimeout(() => { $(toast).fadeOut(500, () => toast.remove()); }, 5000);
        $(toast).find('.close').on('click', () => toast.remove());
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
});

function togglePasswordVisibility(id) {
    const input = document.getElementById(id);
    const btn = input.nextElementSibling.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        btn.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        btn.classList.replace('fa-eye-slash', 'fa-eye');
    }
}
