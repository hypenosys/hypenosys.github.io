/**
 * Global Authentication and Header UI Manager
 */

class AuthManager {
    constructor() {
        this.clientId = window.HY_OAUTH_CONFIG.clientId;
        this.init();
    }

    async init() {
        this.bindEvents();

        if (document.getElementById('dream-team-container')) {
            this.renderDreamTeamComponent();
        }

        const isDashboard = window.location.pathname.includes('dashboard');
        const isJules = window.location.pathname.includes('jules-panel');
        const isNeural = window.location.pathname.includes('/chat/neural/') || window.location.pathname.includes('claude-chat');
        const isGen = window.location.pathname.includes('image-gen') || window.location.pathname.includes('music-gen');

        if (isDashboard || isJules || isNeural || isGen) {
            console.log('[AUTH] Protected page detected. Handling OAuth callback if present...');

            try {
                const result = await this.handleOAuthCallback();
                if (result && result.valid) {
                    console.log('[AUTH] OAuth exchange successful via AuthManager');
                    this.dispatchAuthReady(result.user);
                    this.openRequestedAccountPanel(result.user);
                    return;
                }
            } catch (e) {
                console.error('[AUTH] OAuth exchange failed in init:', e);
            }

            console.log('[AUTH] No OAuth code or exchange completed. Checking existing session...');
            const user = await this.checkAuthState();
            this.dispatchAuthReady(user);
            this.openRequestedAccountPanel(user);
            return;
        }

        await this.handleOAuthCallback();
        const user = await this.checkAuthState();
        this.dispatchAuthReady(user);
        this.openRequestedAccountPanel(user);
    }

    openRequestedAccountPanel(user) {
        const requested = new URLSearchParams(window.location.search).get('account');
        if (!user || !['profile', 'settings', 'api'].includes(requested)) return;
        const url = new URL(window.location.href);
        url.searchParams.delete('account');
        window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        if (requested === 'profile') this.showProfileModal();
        if (requested === 'settings') this.showSettingsModal();
        if (requested === 'api') this.showApiConfigModal();
    }

    dispatchAuthReady(user) {
        const trigger = () => {
            console.log('[AUTH] Dispatching authReady event for user:', user?.login || 'guest');
            document.dispatchEvent(new CustomEvent('authReady', {
                detail: { user: user }
            }));
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => setTimeout(trigger, 100));
        } else {
            setTimeout(trigger, 100);
        }
    }

    async validateJulesKey(key) {
        if (!key) return false;

        if (key.startsWith('nvapi-') || key.startsWith('sk-')) {
            throw new Error("A provider API key (NVIDIA/OpenAI) was detected. Please enter your real Jules API key.");
        }

        try {
            const endpoint = 'https://jules.googleapis.com/v1alpha/sources?pageSize=1';
            const response = await fetch(endpoint, {
                method: 'GET',
                headers: {
                    'x-goog-api-key': key,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) return true;
            if (response.status === 401 || response.status === 403) {
                throw new Error("Jules API Key inválida (Unauthorized/Forbidden)");
            }
            throw new Error(`Error de conexión Jules: ${response.status} ${response.statusText}`);
        } catch (e) {
            console.error('[AUTH] Jules validation failed:', e.message);
            throw e;
        }
    }

    bindEvents() {
        document.getElementById('btn-save-settings')?.addEventListener('click', () => this.handleSaveSettings());
        document.getElementById('btn-logout-denied')?.addEventListener('click', () => this.handleLogout());
        document.getElementById('btn-save-api-config')?.addEventListener('click', () => this.handleSaveApiConfig());

        document.addEventListener('click', (e) => {
            if (e.target.closest('#btn-sign-in, #btn-sign-in-mobile')) this.handleLogin();
            if (e.target.closest('#btn-logout, #btn-logout-mobile')) this.handleLogout();
            if (e.target.closest('#btn-open-settings, #btn-open-settings-mobile')) {
                this.showSettingsModal();
            }
            if (e.target.closest('#btn-open-profile, #btn-open-profile-mobile')) this.showProfileModal();
            if (e.target.closest('#btn-open-api-config, #btn-open-api-config-mobile')) this.showApiConfigModal();
        });

        if (window.jQuery) {
            const $settingsModal = window.jQuery('#settingsModal');
            if ($settingsModal.length) {
                $settingsModal.on('shown.bs.modal', () => {
                    const inputPat = document.getElementById('input-pat');
                    const inputRepo = document.getElementById('input-repo');
                    const inputJulesKey = document.getElementById('input-jules-key-modal');

                    if (inputPat) inputPat.value = localStorage.getItem('github_token') || '';
                    if (inputRepo) inputRepo.value = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';

                    if (inputJulesKey) {
                        const storedKey = typeof window.getJulesApiKey === 'function' ? window.getJulesApiKey() : '';
                        if (storedKey.startsWith('nvapi-') || storedKey.startsWith('sk-')) {
                            inputJulesKey.value = '';
                            inputJulesKey.placeholder = 'Enter real Jules API key (AI key detected)';
                            console.warn('[AUTH] Contaminated jules_api_key found and cleared.');
                            if (typeof window.removeJulesApiKey === 'function') {
                                window.removeJulesApiKey();
                            }
                        } else {
                            inputJulesKey.value = storedKey;
                        }
                    }
                });
            }
        }

        document.getElementById('btn-save-profile')?.addEventListener('click', () => this.handleSaveProfile());
    }

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
            window.history.replaceState({}, document.title, window.location.pathname);

            this.showToast('Autenticando...', 'Intercambiando código con el gatekeeper...', 'info');
            try {
                const result = await window.githubApi.exchangeCodeForToken(code);
                if (result.valid) {
                    this.updateHeaderUI(result.user);
                    this.showToast('Éxito', 'Sesión iniciada correctamente.', 'success');
                    return result;
                } else {
                    const err = {
                        status: result.status || 401,
                        type: 'INVALID',
                        message: 'Fallo en la validación del token tras el intercambio.'
                    };
                    this.handleAuthError(err);
                    throw err;
                }
            } catch (e) {
                console.error('[AUTH] Exchange failed:', e);
                this.showToast('Error', 'Fallo en la autenticación OAuth: ' + (e.message || 'Error desconocido'), 'error');

                window.githubApi.clearAuth();
                this.dispatchAuthReady(null);
                throw e;
            }
        }
        return null;
    }

    async checkAuthState() {
        const token = window.githubApi.getAuthToken();
        if (!token) {
            this.updateHeaderUI(null);
            return null;
        }

        const lastAttempt = parseInt(sessionStorage.getItem('auth_last_attempt') || '0');
        const now = Date.now();
        if (now - lastAttempt < 1000) {
            console.warn('[AuthManager] Deteniendo posible bucle de redirección/validación.');
            return window.githubApi.user;
        }
        sessionStorage.setItem('auth_last_attempt', now.toString());

        try {
            const result = await window.githubApi.validateToken();
            if (result.valid) {
                this.updateHeaderUI(result.user);
                return result.user;
            } else {
                this.handleAuthError({
                    status: result.status || 401,
                    type: 'INVALID'
                });
                return null;
            }
        } catch (e) {
            this.handleAuthError(e);
            return null;
        }
    }

    handleLogin() {
        const chkDashboard = document.getElementById('chk-remember-me-dashboard');
        const chkHeader = document.getElementById('chk-remember-me');
        const chkJules = document.getElementById('chk-remember-me-jules');
        const chkPanelV2 = document.getElementById('chk-remember-me-v2');

        const rememberMe = (chkDashboard?.checked || chkHeader?.checked || chkJules?.checked || chkPanelV2?.checked || false);

        console.log('[AUTH] Initiating login with rememberMe:', rememberMe);
        sessionStorage.setItem('auth_remember_me', rememberMe);

        const scope = 'repo';
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${this.clientId}&scope=${scope}`;
    }

    async handleSaveSettings() {
        const btn = document.getElementById('btn-save-settings');
        if (!btn) return;

        const originalHtml = btn.innerHTML;
        const token = document.getElementById('input-pat')?.value.trim() || '';
        const repo = document.getElementById('input-repo')?.value.trim() || '';
        const julesKey = document.getElementById('input-jules-key-modal')?.value.trim() || '';

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Conectando...';

        const previousToken = window.githubApi.getAuthToken();
        const persisted = !!localStorage.getItem('gh_access_token');
        let replacedToken = false;
        try {
            if (token && token !== previousToken) {
                window.githubApi.setToken(token, persisted);
                replacedToken = true;
            }
            if (repo) window.githubApi.setRepo(repo);
            const validation = await window.githubApi.validateToken();
            if (!validation?.valid || !validation.user?.login) {
                throw new Error('El token de GitHub no es válido o no tiene acceso.');
            }
            this.updateHeaderUI(validation.user);
            document.dispatchEvent(new CustomEvent('authReady', { detail: { user: validation.user } }));

            if (julesKey) {
                if (typeof window.saveJulesApiKey === 'function') {
                    window.saveJulesApiKey(julesKey);
                } else {
                    localStorage.setItem('jules_api_key', julesKey.trim());
                }

                try {
                    await this.validateJulesKey(julesKey);
                } catch (julesErr) {
                    console.error("Jules validation failed:", julesErr);
                    window.julesApiAuthState = 'unauthorized';
                    if (typeof window.updateJulesApiKeyStateIndicator === 'function') {
                        window.updateJulesApiKeyStateIndicator('unauthorized');
                    }
                    throw new Error("Jules API Key inválida o error de conexión (la clave se ha guardado localmente): " + julesErr.message);
                }
            } else {
                if (typeof window.removeJulesApiKey === 'function') {
                    window.removeJulesApiKey();
                } else {
                    localStorage.removeItem('jules_api_key');
                }
            }

            if (window.jQuery) window.jQuery('#settingsModal').modal('hide');
            this.showToast('Éxito', 'Configuración guardada y sesión GitHub verificada.', 'success');

            document.dispatchEvent(new CustomEvent('settingsSaved'));
            window.dispatchEvent(new Event('tokenUpdated'));

            if (window.location.pathname.includes('jules-panel')) {
                if (typeof window.initializeRepoSelector === 'function') {
                    window.initializeRepoSelector();
                }
            }
        } catch (e) {
            if (replacedToken) {
                try {
                    if (previousToken) {
                        window.githubApi.setToken(previousToken, persisted);
                        const restored = await window.githubApi.validateToken();
                        if (restored?.valid) this.updateHeaderUI(restored.user);
                    } else {
                        window.githubApi.clearAuth();
                    }
                } catch (restoreError) {
                    console.error('[AUTH] Failed to restore the previous GitHub session:', restoreError);
                }
            }
            console.error("Save settings failed:", e);
            this.showToast('Error de Conexión', e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    }

    showSettingsModal() {
        this.closeAccountMenus();
        if (!document.getElementById('settingsModal')) {
            window.location.assign('/dashboard.html?account=settings');
            return;
        }
        if (window.jQuery) window.jQuery('#settingsModal').modal('show');
    }

    handleAuthError(e) {
        if (e.status === 401 || e.type === 'INVALID') {
            window.githubApi.clearAuth();
            this.updateHeaderUI(null);
        }

        if (e.status === 403 && e.type === 'ACL_DENIED') {
            this.showToast('Acceso Restringido', 'Estás autenticado pero no tienes permisos de equipo para ciertas operaciones de escritura.', 'warning');

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
        if (typeof window.renderUserStatus === 'function' && (document.getElementById('user-status') || document.getElementById('user-status-mobile'))) {
            window.renderUserStatus(user);
            return;
        }

        const container = document.getElementById('auth-nav-container') || document.getElementById('user-status');
        const leftContainer = document.getElementById('auth-nav-container-left') || document.getElementById('user-status-mobile');
        const chkHeader = document.getElementById('chk-remember-me');

        if (chkHeader && chkHeader.parentElement) {
            chkHeader.parentElement.remove();
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
            const response = await fetch('/assets/data/team.json');
            if (!response.ok) {
                console.warn('[AuthManager] team.json not found in assets/data/');
                return;
            }
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
        this.closeAccountMenus();
        if (window.profileEditor && typeof window.profileEditor.openModal === 'function') {
            return window.profileEditor.openModal();
        }
        this.showToast('Perfil no disponible', 'El editor de perfil no se ha cargado. Recarga la página.', 'error');
    }

    closeAccountMenus() {
        const accountMenu = document.getElementById('gh-mobile-account-menu');
        const accountButton = document.getElementById('gh-mobile-account-toggle');
        if (accountMenu) accountMenu.hidden = true;
        if (accountButton) accountButton.setAttribute('aria-expanded', 'false');
        const nav = document.getElementById('gh-nav-content');
        nav?.classList.remove('open');
        const navToggle = document.getElementById('gh-mobile-toggle');
        if (navToggle) {
            navToggle.setAttribute('aria-expanded', 'false');
            navToggle.setAttribute('aria-label', 'Abrir menú');
        }
        document.querySelectorAll('[id^="user-menu-"]').forEach(menu => menu.classList.add('hidden'));
    }

    async handleSaveProfile() {
        const name = document.getElementById('edit-profile-name')?.value.trim() || '';
        const role = document.getElementById('edit-profile-role')?.value.trim() || '';
        const desc = document.getElementById('edit-profile-desc')?.value.trim() || '';
        const portfolio = document.getElementById('edit-profile-portfolio')?.value.trim() || '';
        const julesKey = document.getElementById('input-jules-key')?.value.trim() || '';

        if (julesKey) {
            if (!julesKey.startsWith('nvapi-') && !julesKey.startsWith('sk-')) {
                if (typeof window.saveJulesApiKey === 'function') {
                    try {
                        window.saveJulesApiKey(julesKey);
                    } catch (e) {
                        console.error('[AUTH] Failed to save Jules Key from Profile:', e.message);
                    }
                }
            } else {
                console.warn('[AUTH] AI provider key blocked from jules_api_key slot');
            }
        }

        if (!name || !role) {
            this.showToast('Error', 'Nombre y Rol son campos obligatorios.', 'error');
            return;
        }

        const btn = document.getElementById('btn-save-profile');
        const originalHtml = btn ? btn.innerHTML : 'Guardar Cambios';

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
        }

        try {
            const login = window.githubApi.user.login;
            const response = await fetch('/assets/data/team_profiles.json');
            if (!response.ok) throw new Error('No se pudo cargar team_profiles.json');
            const profilesRes = await response.json();
            const profiles = profilesRes.members;
            const memberEntry = Object.entries(profiles).find(([k, v]) => v.github_username.toLowerCase() === login.toLowerCase());
            if (!memberEntry) throw new Error("No se encontró perfil de equipo vinculado a este GitHub.");

            const memberName = memberEntry[0];
            const profileDelta = { display_name: name, role, bio: desc, portfolio };
            await window.githubApi.updateMemberProfile(memberName, profileDelta);

            if (window.currentProfiles && window.currentProfiles.members[memberName]) {
                window.currentProfiles.members[memberName] = {
                    ...window.currentProfiles.members[memberName],
                    ...profileDelta,
                    display_name: name,
                    bio: desc
                };
                if (typeof window.renderTeamProfiles === 'function') {
                    window.renderTeamProfiles();
                }
            }

            this.showToast('Éxito', 'Cambios guardados. La homepage se actualizará en ~1-2 min tras el build de GitHub Pages.', 'success');
            if (window.jQuery) window.jQuery('#profileModal').modal('hide');
            await this.renderDreamTeamComponent();
        } catch (e) {
            console.error(e);
            this.showToast('Error', 'Fallo al guardar los cambios: ' + e.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    }

    async showApiConfigModal() {
        this.closeAccountMenus();
        if (!document.getElementById('modalApiConfig')) {
            window.location.assign('/dashboard.html?account=api');
            return;
        }
        const user = window.githubApi.user;
        if (!user) {
            this.showToast('Error', 'Debes estar autenticado para configurar la API.', 'error');
            return;
        }

        const login = user.login;
        let config = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');

        if (!config.provider || !config.model) {
            try {
                const response = await fetch('/assets/data/team_profiles.json');
                if (!response.ok) throw new Error('No se pudo cargar team_profiles.json');
                const profilesRes = await response.json();
                const profiles = profilesRes.members;
                const memberEntry = Object.values(profiles).find(v => v.github_username.toLowerCase() === login.toLowerCase());
                if (memberEntry && memberEntry.ai_config) {
                    config.provider = config.provider || memberEntry.ai_config.provider;
                    config.model = config.model || memberEntry.ai_config.model;
                }
            } catch (e) {
                console.warn('[AuthManager] No se pudo cargar team_profiles para fallback de API config:', e);
            }
        }

        const aiProfileName = document.getElementById('ai_profile_name');
        const aiProvider = document.getElementById('ai_provider');
        const aiModel = document.getElementById('ai_model');
        const aiApiKey = document.getElementById('ai_api_key');
        const aiBaseUrl = document.getElementById('ai_base_url');
        const aiLocalNetwork = document.getElementById('ai_local_network');

        // Embeddings fields
        const aiEmbedProvider = document.getElementById('ai_embed_provider');
        const aiEmbedBaseUrl = document.getElementById('ai_embed_base_url');
        const aiEmbedApiKey = document.getElementById('ai_embed_api_key');
        const aiEmbeddingModel = document.getElementById('ai_embedding_model');

        if (aiProfileName) aiProfileName.value = config.name || '';
        if (aiProvider) aiProvider.value = config.provider || 'none';
        if (aiModel) aiModel.value = config.model || '';
        if (aiApiKey) aiApiKey.value = config.api_key || '';
        if (aiBaseUrl) aiBaseUrl.value = config.base_url || '';
        if (aiLocalNetwork) aiLocalNetwork.checked = !!(config.local_network || config.localNetwork);

        // Populate decoupled embeddings fields with legacy migration fallback
        if (aiEmbedProvider) aiEmbedProvider.value = config.embed_provider || config.ai_embed_provider || 'same_as_main';
        if (aiEmbedBaseUrl) aiEmbedBaseUrl.value = config.embed_base_url || '';
        if (aiEmbedApiKey) aiEmbedApiKey.value = config.embed_api_key || '';
        if (aiEmbeddingModel) aiEmbeddingModel.value = config.embedding_model || config.embed_model || '';

        // Initialize state tracking variables in OllamaUI
        if (window.ollamaUI) {
            window.ollamaUI.previousProvider = config.provider || 'none';
            window.ollamaUI.previousEmbeddingsProvider = config.embed_provider || config.ai_embed_provider || 'same_as_main';
            window.ollamaUI.handleProviderChange();
            window.ollamaUI.handleEmbedProviderChange();
        }

        if (typeof window.hydrateJulesApiKeyModal === 'function') {
            window.hydrateJulesApiKeyModal();
        }

        if (typeof window.initJulesApiKeyModalListeners === 'function') {
            window.initJulesApiKeyModalListeners();
        }

        if (window.jQuery) window.jQuery('#modalApiConfig').modal('show');
    }

    async handleSaveApiConfig() {
        if (!window.githubApi.user) return;
        const login = window.githubApi.user.login;

        const name = document.getElementById('ai_profile_name')?.value.trim() || '';
        const provider = document.getElementById('ai_provider')?.value || 'none';
        const model = document.getElementById('ai_model')?.value.trim() || '';
        const apiKey = document.getElementById('ai_api_key')?.value.trim() || '';
        const baseUrl = document.getElementById('ai_base_url')?.value.trim() || '';
        const localNetwork = document.getElementById('ai_local_network')?.checked || false;

        // Decoupled embeddings fields
        const embedProvider = document.getElementById('ai_embed_provider')?.value || 'same_as_main';
        const embedBaseUrl = document.getElementById('ai_embed_base_url')?.value.trim() || '';
        const embedApiKey = document.getElementById('ai_embed_api_key')?.value.trim() || '';
        const embeddingModel = document.getElementById('ai_embedding_model')?.value.trim() || '';

        const btn = document.getElementById('btn-save-api-config');
        const originalHtml = btn ? btn.innerHTML : 'Guardar Configuración';

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';
        }

        try {
            const localConfig = {
                name,
                provider,
                model,
                api_key: apiKey,
                base_url: baseUrl,
                local_network: localNetwork,
                embed_provider: embedProvider,
                embed_base_url: embedBaseUrl,
                embed_api_key: embedApiKey,
                embedding_model: embeddingModel,
                embed_model: embeddingModel
            };
            localStorage.setItem('hy_ai_config', JSON.stringify(localConfig));

            const response = await fetch('/assets/data/team_profiles.json');
            if (!response.ok) throw new Error('No se pudo cargar team_profiles.json');
            const profilesRes = await response.json();
            const memberEntry = Object.entries(profilesRes.members).find(([k, v]) => v.github_username.toLowerCase() === login.toLowerCase());

            if (memberEntry) {
                const memberName = memberEntry[0];
                await window.githubApi.updateMemberAiConfig(memberName, { provider, model });
            }

            if (window.hypeToast) {
                window.hypeToast('Configuración API guardada ✓', 'success');
            } else {
                this.showToast('Éxito', 'Configuración API guardada correctamente.', 'success');
            }
            if (window.jQuery) window.jQuery('#modalApiConfig').modal('hide');
        } catch (e) {
            console.error(e);
            if (window.hypeToast) {
                window.hypeToast('Error al guardar. Inténtalo de nuevo.', 'error');
            } else {
                this.showToast('Error', 'Fallo al guardar la configuración: ' + e.message, 'error');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
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

        const removeToast = () => {
            if (toast.parentNode) {
                if (window.jQuery) {
                    window.jQuery(toast).fadeOut(500, () => {
                        if (toast.parentNode) toast.remove();
                    });
                } else {
                    toast.remove();
                }
            }
        };

        setTimeout(removeToast, 5000);
        const closeBtn = toast.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                if (toast.parentNode) toast.remove();
            });
        }
    }
}

window.initJulesApiKeyModalListeners = function() {
    if (window._julesApiKeyEventsInitialized) return;

    document.addEventListener('click', async (e) => {
        const toggleBtn = e.target.closest('#jules-panel-api-key-toggle');
        const saveBtn = e.target.closest('#btn-save-jules-api-key');
        const deleteBtn = e.target.closest('#btn-delete-jules-api-key');

        if (toggleBtn) {
            e.preventDefault();
            const input = document.getElementById('jules-panel-api-key-input');
            if (!input) return;
            if (input.type === 'password') {
                input.type = 'text';
                toggleBtn.setAttribute('aria-pressed', 'true');
                toggleBtn.setAttribute('aria-label', 'Ocultar API Key');
                const icon = toggleBtn.querySelector('i');
                if (icon) icon.className = 'fas fa-eye-slash';
            } else {
                input.type = 'password';
                toggleBtn.setAttribute('aria-pressed', 'false');
                toggleBtn.setAttribute('aria-label', 'Mostrar API Key');
                const icon = toggleBtn.querySelector('i');
                if (icon) icon.className = 'fas fa-eye';
            }
        }

        if (saveBtn) {
            e.preventDefault();
            const input = document.getElementById('jules-panel-api-key-input');
            if (!input) return;
            const val = input.value.trim();

            if (!val) {
                if (typeof window.hypeToast === 'function') window.hypeToast("Introduce una API Key válida", "amber");
                else if (window.authManager && typeof window.authManager.showToast === 'function') window.authManager.showToast("Introduce una API Key", "Introduce una API Key válida", "amber");
                else alert("Introduce una API Key válida");
                input.focus();
                return;
            }

            if (typeof window.isJulesApiKeyValid === 'function' && !window.isJulesApiKeyValid(val)) {
                if (typeof window.hypeToast === 'function') window.hypeToast("Estructura de Jules API Key inválida", "red");
                else if (window.authManager && typeof window.authManager.showToast === 'function') window.authManager.showToast("Estructura inválida", "Estructura de Jules API Key inválida", "red");
                else alert("Estructura de Jules API Key inválida");
                return;
            }

            if (val.startsWith('nvapi-') || val.startsWith('sk-')) {
                if (typeof window.hypeToast === 'function') window.hypeToast("Clave de proveedor IA detectada", "red");
                else if (window.authManager && typeof window.authManager.showToast === 'function') window.authManager.showToast("Error de formato", "Se detectó una API key de proveedor (NVIDIA/OpenAI). Ingresa tu Jules API key real.", "red");
                else alert("Se detectó una API key de proveedor. Ingresa tu Jules API key real.");
                return;
            }

            const originalHtml = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Guardando...';

            try {
                if (typeof window.handleJulesApiKeyChanged === 'function') {
                    await window.handleJulesApiKeyChanged(val);
                } else {
                    window.saveJulesApiKey(val);
                    window.julesApiAuthState = 'configured';
                    window.updateJulesApiKeyStateIndicator('configured');

                    if (typeof window.renderJulesSessions === 'function') {
                        window.renderJulesSessions();
                    }
                }

                saveBtn.innerHTML = 'Guardada ✓';
                setTimeout(() => {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = originalHtml;
                }, 1500);

                if (typeof window.hypeToast === 'function') window.hypeToast("API Key guardada ✓", "success");
                else if (window.authManager && typeof window.authManager.showToast === 'function') window.authManager.showToast("Éxito", "API Key guardada ✓", "success");
            } catch (err) {
                console.error('[JULES-KEY] Error saving key:', err);
                if (typeof window.hypeToast === 'function') window.hypeToast("Error: " + err.message, "error");
                else if (window.authManager && typeof window.authManager.showToast === 'function') window.authManager.showToast("Error", err.message, "error");
                else alert("Error al guardar: " + err.message);

                saveBtn.disabled = false;
                saveBtn.innerHTML = originalHtml;
            }
        }

        if (deleteBtn) {
            e.preventDefault();
            if (!confirm("¿Estás seguro de que deseas borrar la Jules API Key de este navegador?")) return;

            const input = document.getElementById('jules-panel-api-key-input');

            try {
                if (typeof window.handleJulesApiKeyChanged === 'function') {
                    await window.handleJulesApiKeyChanged('');
                } else {
                    window.removeJulesApiKey();
                    if (input) {
                        input.value = '';
                    }
                    window.julesApiAuthState = 'none';
                    window.updateJulesApiKeyStateIndicator('none');

                    if (typeof window.renderJulesSessions === 'function') {
                        window.renderJulesSessions();
                    }
                }

                if (typeof window.hypeToast === 'function') window.hypeToast("API Key eliminada con éxito", "success");
                else if (window.authManager && typeof window.authManager.showToast === 'function') window.authManager.showToast("Borrado", "API Key eliminada con éxito", "amber");
            } catch (err) {
                console.error('[JULES-KEY] Error deleting key:', err);
                if (typeof window.hypeToast === 'function') window.hypeToast("Error: " + err.message, "error");
                else if (window.authManager && typeof window.authManager.showToast === 'function') window.authManager.showToast("Error", err.message, "error");
            }
        }
    });

    window._julesApiKeyEventsInitialized = true;
};

document.addEventListener('DOMContentLoaded', () => {
    window.authManager = new AuthManager();
    window.initJulesApiKeyModalListeners();
    if (typeof window.hydrateJulesApiKeyModal === 'function') {
        window.hydrateJulesApiKeyModal();
    }
    if (window.jQuery) {
        window.jQuery('#modalApiConfig').on('shown.bs.modal', () => {
            if (typeof window.hydrateJulesApiKeyModal === 'function') {
                window.hydrateJulesApiKeyModal();
            }
        });
    }
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
