/**
 * Global Authentication and Header UI Manager
 */

class AuthManager {
    constructor() {
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.checkAuthState();
    }

    bindEvents() {
        // Settings Modal: Save Button
        document.getElementById('btn-save-settings')?.addEventListener('click', () => this.handleSaveSettings());

        // Access Denied Modal: Logout Button
        document.getElementById('btn-logout-denied')?.addEventListener('click', () => this.handleLogout());

        // Header events are handled via data-attributes or dynamic injection
        document.addEventListener('click', (e) => {
            if (e.target.closest('#btn-sign-in')) {
                $('#settingsModal').modal('show');
            }
            if (e.target.closest('#btn-logout')) {
                this.handleLogout();
            }
            if (e.target.closest('#btn-open-settings')) {
                $('#settingsModal').modal('show');
            }
        });

        // Initialize modal inputs when shown
        $('#settingsModal').on('shown.bs.modal', () => {
            document.getElementById('input-pat').value = localStorage.getItem('github_pat') || '';
            document.getElementById('input-repo').value = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';
        });
    }

    async checkAuthState() {
        const token = localStorage.getItem('github_pat');
        if (!token) {
            this.updateHeaderUI(null);
            return;
        }

        try {
            const user = await window.githubApi.validateToken();
            this.updateHeaderUI(user);
        } catch (e) {
            this.handleAuthError(e);
        }
    }

    async handleSaveSettings() {
        const token = document.getElementById('input-pat').value.trim();
        const repo = document.getElementById('input-repo').value.trim();

        if (!token) {
            this.showToast('Error', 'Un PAT con permisos de repo o fine-grained "Contents & Issues" es estrictamente obligatorio.', 'error');
            return;
        }

        window.githubApi.setToken(token);
        window.githubApi.setRepo(repo);

        try {
            const user = await window.githubApi.validateToken();
            this.updateHeaderUI(user);
            $('#settingsModal').modal('hide');
            this.showToast('Éxito', 'Autenticación completada con éxito.', 'success');

            // Reload if on dashboard to refresh data
            if (window.location.pathname.includes('dashboard')) {
                window.location.reload();
            }
        } catch (e) {
            this.handleAuthError(e);
        }
    }

    handleAuthError(e) {
        if (e.status === 401 || e.status === 403) {
            if (e.type === 'ACL_DENIED') {
                // Immediately wipe the token for zero-trust isolation
                window.githubApi.clearAuth();

                document.getElementById('access-denied-message').innerText = `Autenticado como ${e.user}. Sin embargo, no figuras en la lista de acceso crítico de Hypenosys. Acceso denegado.`;
                $('#settingsModal').modal('hide');
                $('#accessDeniedModal').modal('show');
            } else {
                window.githubApi.clearAuth();
                this.updateHeaderUI(null);
                this.showToast('Error de Autenticación', 'El PAT proporcionado no es válido o ha expirado.', 'error');
            }
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

        if (user) {
            container.innerHTML = `
                <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle d-flex align-items-center" href="#" id="userDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                        <span class="mr-2 d-none d-lg-inline text-gray-600 small font-weight-mono">${user.login}</span>
                        <div class="position-relative">
                            <img src="${user.avatar_url}" width="32" height="32" class="rounded-circle border-purple shadow-sm">
                            <span class="connectivity-dot"></span>
                        </div>
                    </a>
                    <div class="dropdown-menu dropdown-menu-right shadow animated--grow-in bg-dark border-purple" aria-labelledby="userDropdown">
                        <a class="dropdown-item text-white" href="#" id="btn-open-settings">
                            <i class="fas fa-cog fa-sm fa-fw mr-2 text-purple"></i>
                            Configuración / Repositorio
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
                        <i class="fa-brands fa-github mr-1"></i> Sign In
                    </button>
                </li>
            `;
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

        // Auto-remove after 5 seconds
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
