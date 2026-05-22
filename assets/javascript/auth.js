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
        await this.handleOAuthCallback();
        await this.checkAuthState();
        
        // ─── FIX: solo disparar authReady si el user está completo
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
            if (e.target.closest('#btn-open-settings')) {
                $('#settingsModal').modal('show');
            }
            if (e.target.closest('#btn-open-profile')) {
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
                const response = await fetch('https://hypenosys-gatekeeper-v2.axlffcc.workers.dev', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code })
                });
                const data = await response.json();

                if (data.access_token) {
                    window.githubApi.setToken(data.access_token);
                    const result = await window.githubApi.validateToken();
                    if (result.valid) {
                        this.updateHeaderUI(result.user);
                        this.showToast('Éxito', 'Sesión iniciada correctamente.', 'success');
                    }
                } else {
                    throw new Error(data.error || 'No se recibió token del gatekeeper');
                }
            } catch (e) {
                console.error('OAuth exchange failed:', e);
                this.showToast('Error', 'Fallo en la autenticación OAuth.', 'error');
            }
        }
    }

    async checkAuthState() {
        const token = localStorage.getItem('github_token') || sessionStorage.getItem('gh_access_token');
        if (!token) {
            this.updateHeaderUI(null);
            return;
        }

        try {
            const result = await window.githubApi.validateToken();
            if (result.valid) {
                this.updateHeaderUI(result.user);
                if (document.getElementById('dream-team-container')) {
                    await this.renderDreamTeamComponent();
                }
            } else {
                this.handleAuthError({ status: result.user ? 403 : 401, type: result.user ? 'ACL_DENIED' : 'INVALID' });
            }
        } catch (e) {
            this.handleAuthError(e);
        }
    }

    handleLogin() {
        const scope = 'repo';
        window.location.href = `https://github.com/login/oauth/authorize?client_id=${this.clientId}&scope=${scope}`;
    }

    async handleSaveSettings() {
        const token = document.getElementById('input-pat').value.trim();
        const repo = document.getElementById('input-repo').value.trim();
        const julesKey = document.getElementById('input-jules-key-modal').value.trim();

        if (token) window.githubApi.setToken(token);
        window.githubApi.setRepo(repo);

        if (julesKey) {
            localStorage.setItem('jules_api_key', julesKey);
        } else {
            localStorage.removeItem('jules_api_key');
        }

        try {
            const user = await window.githubApi.validateToken();
            this.updateHeaderUI(user);
            $('#settingsModal').modal('hide');
            this.showToast('Éxito', 'Configuración actualizada.', 'success');

            // Dispatch event for other components (like Jules Panel) to refresh
            document.dispatchEvent(new CustomEvent('settingsSaved'));

            if (window.location.pathname.includes('dashboard') || window.location.pathname.includes('jules-panel')) {
                setTimeout(() => window.location.reload(), 1000);
            }
        } catch (e) {
            this.handleAuthError(e);
        }
    }

    showSettingsModal() {
        $('#settingsModal').modal('show');
    }

    handleAuthError(e) {
        if (e.status === 403 && e.type === 'ACL_DENIED') {
            window.githubApi.clearAuth();
            this.updateHeaderUI(null);
            document.getElementById('access-denied-message').innerText = "Autenticado con éxito en GitHub, pero no tienes autorización explícita de la facción Hypenosys. Acceso revocado.";
            $('#settingsModal').modal('hide');
            $('#accessDeniedModal').modal('show');
        } else if (e.status === 401) {
            window.githubApi.clearAuth();
            this.updateHeaderUI(null);
            this.showToast('Sesión Expirada', 'Por favor, vuelve a iniciar sesión.', 'error');
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
        if (!container) return;

        // ─── FIX: guard contra user incompleto
        if (user && !user.login) {
            console.warn('[AuthManager] updateHeaderUI llamado con user sin login:', user);
            return;
        }

        if (user) {
            container.innerHTML = `
                <li class="nav-item">
                    <a class="nav-link" href="/dashboard.html">
                        <i class="fas fa-tachometer-alt fa-sm fa-fw mr-1 text-purple"></i> Dashboard
                    </a>
                </li>
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
        } else {
            container.innerHTML = `
                <li class="nav-item">
                    <button id="btn-sign-in" class="btn btn-outline-purple btn-sm ml-lg-3 mt-1 mt-lg-0">
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
            
            // Map GitHub login to Member Name in team_profiles.json
            const profilesRes = await window.githubApi.fetchFileWithSha('_data/team_profiles.json');
            const profiles = profilesRes.content.members;
            const memberEntry = Object.entries(profiles).find(([k, v]) => v.handle.toLowerCase() === login.toLowerCase());

            if (!memberEntry) throw new Error("No se encontró perfil de equipo vinculado a este GitHub.");

            const memberName = memberEntry[0];
            const profileDelta = {
                display_name: name,
                role: role,
                bio: desc,
                portfolio: portfolio
            };

            await window.githubApi.updateMemberProfile(memberName, profileDelta);
            
            this.showToast('Éxito', 'Perfil actualizado correctamente. Refrescando...', 'success');
            $('#profileModal').modal('hide');
            
            // Refresh UI
            await this.renderDreamTeamComponent();
        } catch (e) {
            console.error(e);
            this.showToast('Error', 'Fallo al guardar los cambios: ' + e.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Guardar Cambios';
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
