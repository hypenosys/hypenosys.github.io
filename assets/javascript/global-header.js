/**
 * Hypenosys Global Header Component
 * Unified navigation for all platform pages.
 */

class GlobalHeader {
    constructor() {
        this.init();
    }

    init() {
        console.log('[GlobalHeader] Initializing unified navigation...');
        this.injectStyles();
        this.ensureConsentManager();
        this.render();
        this.renderDataBranchBadge();
        this.bindEvents();
        this.dispatchReady();
    }

    ensureConsentManager() {
        if (!window.HypenosysConsent && !document.getElementById('hy-consent-script')) {
            const script = document.createElement('script');
            script.id = 'hy-consent-script';
            script.src = '/assets/javascript/analytics-consent.js';
            document.head.appendChild(script);
        }
    }

    injectStyles() {
        if (document.getElementById('global-header-styles')) return;

        const style = document.createElement('style');
        style.id = 'global-header-styles';
        style.textContent = `
            :root {
                --gh-bg: #0f172a;
                --gh-border: #1e293b;
                --gh-accent: #bd93f9;
                --gh-text: #f8fafc;
                --gh-text-dim: #94a3b8;
                --gh-h: 64px;
            }

            .gh-navbar {
                height: var(--gh-h);
                background: var(--gh-bg);
                border-bottom: 1px solid var(--gh-border);
                position: sticky;
                top: 0;
                z-index: 3000;
                display: flex;
                align-items: center;
                padding: 0 1.5rem;
                font-family: 'Inter', system-ui, sans-serif;
            }

            .gh-container {
                max-width: 1600px;
                width: 100%;
                margin: 0 auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 1.5rem;
            }

            .gh-logo {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                text-decoration: none;
                flex-shrink: 0;
            }

            .gh-logo img {
                height: 32px;
                width: auto;
            }

            .gh-nav-content {
                display: flex;
                align-items: center;
                justify-content: flex-end;
                flex-grow: 1;
                gap: 1.25rem;
            }

            .gh-nav-groups {
                display: flex;
                align-items: center;
                gap: 0.5rem;
            }

            .gh-nav-item {
                position: relative;
            }

            .gh-dropdown-toggle {
                color: var(--gh-text-dim);
                text-decoration: none;
                font-size: 10px;
                font-weight: 800;
                display: flex;
                align-items: center;
                gap: 0.4rem;
                cursor: pointer;
                transition: all 0.2s;
                text-transform: uppercase;
                letter-spacing: 0.08em;
                padding: 0.5rem 0.75rem;
                border-radius: 6px;
                white-space: nowrap;
            }

            .gh-nav-item:hover .gh-dropdown-toggle {
                color: var(--gh-text);
                background: rgba(255,255,255,0.05);
            }

            .gh-dropdown-content {
                display: none;
                position: absolute;
                top: 100%;
                left: 0;
                background: #0f172a;
                border: 1px solid var(--gh-border);
                border-radius: 8px;
                min-width: 220px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.6);
                padding: 0.5rem 0;
                z-index: 3010;
                margin-top: 0.25rem;
            }

            .gh-nav-item:hover .gh-dropdown-content {
                display: block;
            }

            /* Bridge the gap between toggle and dropdown content */
            .gh-dropdown-content::before {
                content: '';
                position: absolute;
                top: -0.5rem;
                left: 0;
                right: 0;
                height: 0.5rem;
                background: transparent;
            }

            .gh-dropdown-link {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.75rem 1.25rem;
                color: var(--gh-text-dim);
                text-decoration: none;
                font-size: 13px;
                font-weight: 500;
                transition: all 0.2s;
            }

            .gh-dropdown-link:hover {
                background: rgba(189, 147, 249, 0.1);
                color: var(--gh-accent);
            }

            .gh-dropdown-link i { width: 16px; text-align: center; }

            .gh-status-badge-slot {
                display: flex;
                align-items: center;
            }

            .gh-data-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                padding: 0.2rem 0.55rem;
                border-radius: 9999px;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.05em;
                text-transform: uppercase;
                white-space: nowrap;
                user-select: none;
            }

            .gh-data-badge--develop {
                background: rgba(189, 147, 249, 0.15);
                color: #bd93f9;
                border: 1px solid rgba(189, 147, 249, 0.35);
            }

            .gh-data-badge--master {
                background: rgba(255, 85, 85, 0.15);
                color: #ff5555;
                border: 1px solid rgba(255, 85, 85, 0.45);
            }

            .member-filters-toggle-btn {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid var(--gh-border);
                color: var(--gh-text-dim);
                padding: 0.4rem 0.6rem;
                border-radius: 6px;
                cursor: pointer;
                font-size: 11px;
                display: flex;
                align-items: center;
                gap: 0.4rem;
                transition: all 0.2s;
                height: 28px;
            }

            .member-filters-toggle-btn:hover {
                color: var(--gh-text);
                background: rgba(255, 255, 255, 0.1);
            }

            .gh-mobile-actions {
                display: none;
                align-items: center;
                gap: 0.4rem;
                flex: 0 0 auto;
            }

            .gh-mobile-auth { position: relative; flex: 0 0 auto; }
            .gh-mobile-login, .gh-mobile-account-toggle {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-height: 44px;
                border: 1px solid rgba(189, 147, 249, 0.65);
                border-radius: 7px;
                color: var(--gh-text);
                background: rgba(189, 147, 249, 0.10);
                font-weight: 700;
                font-size: 12px;
                white-space: nowrap;
                cursor: pointer;
            }
            .gh-mobile-login { padding: 0 0.7rem; }
            .gh-mobile-login:hover, .gh-mobile-account-toggle:hover {
                background: rgba(189, 147, 249, 0.22);
                color: white;
            }
            .gh-mobile-login-short { display: none; }
            .gh-mobile-account-toggle { width: 44px; padding: 3px; }
            .gh-mobile-account-toggle img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
            .gh-mobile-account-initials { font-weight: 800; color: #bd93f9; }
            .gh-mobile-account-menu {
                position: absolute;
                right: 0;
                top: calc(100% + 7px);
                z-index: 3100;
                width: min(80vw, 250px);
                border: 1px solid var(--gh-border);
                border-radius: 9px;
                background: var(--gh-bg);
                padding: 0.5rem;
                box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
            }
            .gh-mobile-account-menu[hidden] { display: none !important; }
            .gh-mobile-account-name {
                display: block;
                overflow-wrap: anywhere;
                color: var(--gh-text);
                padding: 0.55rem 0.7rem;
                font-size: 12px;
                font-weight: 700;
            }
            .gh-mobile-account-menu button {
                display: block;
                width: 100%;
                min-height: 44px;
                text-align: left;
                border: 0;
                border-radius: 5px;
                padding: 0.55rem 0.7rem;
                color: var(--gh-text);
                background: transparent;
                cursor: pointer;
            }
            .gh-mobile-account-menu button:hover,
            .gh-mobile-account-menu button:focus-visible { background: rgba(189,147,249,0.16); }
            .gh-mobile-login:focus-visible, .gh-mobile-account-toggle:focus-visible, .gh-mobile-toggle:focus-visible {
                outline: 2px solid #8be9fd;
                outline-offset: 2px;
            }

            .gh-auth-section {
                display: flex;
                align-items: center;
                gap: 1rem;
                border-left: 1px solid var(--gh-border);
                padding-left: 1rem;
                min-width: 140px;
                justify-content: flex-end;
            }

            /* Global Header Responsive Hamburger */
            .gh-mobile-toggle {
                display: none;
                align-items: center;
                justify-content: center;
                flex: 0 0 44px;
                width: 44px;
                min-height: 44px;
                background: none;
                border: 1px solid var(--gh-border);
                color: var(--gh-text);
                border-radius: 6px;
                cursor: pointer;
                font-size: 22px;
                line-height: 1;
            }

            @media (max-width: 900px) {
                .gh-navbar { padding: 0 1rem; }
                .gh-container { gap: 0.75rem; }
                .gh-dropdown-toggle { font-size: 9px; padding: 0.5rem 0.4rem; }
            }

            @media (max-width: 750px) {
                .gh-container { min-width: 0; }
                .gh-logo { min-width: 0; }
                .gh-logo img { width: auto; max-width: min(30vw, 130px); height: auto; max-height: 32px; }
                .gh-mobile-toggle { display: inline-flex; }
                .gh-mobile-actions { display: flex; }
                .gh-nav-content {
                    display: none;
                    position: absolute;
                    top: var(--gh-h);
                    left: 0;
                    right: 0;
                    background: #0f172a;
                    flex-direction: column;
                    padding: 1.5rem;
                    border-bottom: 1px solid var(--gh-border);
                    gap: 1.5rem;
                    align-items: flex-start;
                }
                .gh-nav-content.open { display: flex; }
                .gh-nav-groups { flex-direction: column; width: 100%; }
                .gh-dropdown-content { position: static; box-shadow: none; border: none; display: block; padding-left: 1rem; }
                .gh-auth-section { border-left: none; padding-left: 0; width: 100%; justify-content: flex-start; }
            }
            @media (max-width: 400px) {
                .gh-mobile-login-full { display: none; }
                .gh-mobile-login-short { display: inline; }
                .gh-mobile-login { padding: 0 0.55rem; }
                .gh-container { gap: 0.4rem; }
                .gh-mobile-actions { gap: 0.3rem; }
            }
        `;
        document.head.appendChild(style);
    }

    renderDataBranchBadge() {
        const slot = document.getElementById('header-status-slot');
        if (!slot) return;

        const branch = (window.HY_OAUTH_CONFIG && window.HY_OAUTH_CONFIG.dataBranch) || 'develop';
        const isMaster = branch === 'master';
        const badgeClass = isMaster ? 'gh-data-badge--master' : 'gh-data-badge--develop';
        const iconClass = isMaster ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-code-branch';

        slot.innerHTML = `
            <span class="gh-data-badge ${badgeClass}" title="Rama de datos activa: ${branch}">
                <i class="${iconClass}"></i>
                DATA: ${branch}
            </span>
        `;
    }

    render() {
        const header = document.createElement('header');
        header.className = 'gh-navbar';

        const sections = window.HYPENOSYS_PAGE_SECTIONS || [];
        const sectionDropdown = sections.length > 0 ? `
            <div class="gh-nav-item" id="gh-nav-sections">
                <div class="gh-dropdown-toggle">Sección <i class="fas fa-chevron-down fa-xs"></i></div>
                <div class="gh-dropdown-content">
                    ${sections.map(s => {
                        const onclick = s.onclick ? `onclick="${s.onclick}"` : '';
                        return `
                        <a href="${s.href}" ${onclick} class="gh-dropdown-link">
                            <i class="${s.icon || 'fas fa-bookmark'}"></i> ${s.label}
                        </a>`;
                    }).join('')}
                </div>
            </div>
        ` : '';

        header.innerHTML = `
            <div class="gh-container">
                <a href="/" class="gh-logo">
                    <img src="https://raw.githubusercontent.com/hypenosys/hypenosys-logo/master/logo_simple.svg" alt="Hypenosys">
                </a>

                <div class="gh-mobile-actions">
                    <div class="gh-mobile-auth" id="gh-mobile-auth" aria-label="Acceso con GitHub"></div>
                    <button id="member-filters-toggle-mobile" class="member-filters-toggle-btn" style="display: none;">
                        <i class="member-filters-toggle-icon fa-solid fa-chevron-up"></i>
                    </button>

                    <button type="button" class="gh-mobile-toggle" id="gh-mobile-toggle" aria-label="Abrir menú" aria-controls="gh-nav-content" aria-expanded="false">
                        <span aria-hidden="true">&#9776;</span>
                    </button>
                </div>

                <div class="gh-nav-content" id="gh-nav-content">
                    <div class="gh-nav-groups">
                        <!-- Plataforma -->
                        <div class="gh-nav-item">
                            <div class="gh-dropdown-toggle">Plataforma <i class="fas fa-chevron-down fa-xs"></i></div>
                            <div class="gh-dropdown-content">
                                <a href="/dashboard.html" class="gh-dropdown-link"><i class="fas fa-tachometer-alt"></i> Dashboard</a>
                                <a href="/documentacion/" class="gh-dropdown-link"><i class="fas fa-book"></i> Documentación</a>
                                <a href="/guia-comandos/" class="gh-dropdown-link"><i class="fas fa-terminal"></i> Comandos</a>
                                <a href="/tech-stack/" class="gh-dropdown-link"><i class="fas fa-layer-group"></i> Tech Stack</a>
                                <a href="/unreal-tutorial/" class="gh-dropdown-link"><i class="fas fa-graduation-cap"></i> UE5 Tutorial</a>
                            </div>
                        </div>

                        <!-- Herramientas IA -->
                        <div class="gh-nav-item">
                            <div class="gh-dropdown-toggle">Herramientas IA <i class="fas fa-chevron-down fa-xs"></i></div>
                            <div class="gh-dropdown-content">
                                <a href="/chat/neural/" class="gh-dropdown-link"><i class="fas fa-brain"></i> Neural Chat</a>
                                <a href="/music-gen/" class="gh-dropdown-link"><i class="fas fa-music"></i> MusicGen</a>
                                <a href="/image-gen/" class="gh-dropdown-link"><i class="fas fa-wand-magic-sparkles"></i> ImageGen</a>
                                <a href="/jules-panel/" class="gh-dropdown-link"><i class="fas fa-robot"></i> Jules Panel</a>
                            </div>
                        </div>

                        <!-- Sección (Dinamico) -->
                        ${sectionDropdown}
                    </div>

                    <div class="gh-status-badge-slot" id="header-status-slot"></div>

                    <button id="member-filters-toggle" class="member-filters-toggle-btn" style="display: none;">
                        <i id="member-filters-toggle-icon" class="member-filters-toggle-icon fa-solid fa-chevron-up"></i>
                    </button>

                    <div class="gh-auth-section">
                        <ul id="auth-nav-container-left" style="list-style:none; margin:0; padding:0; display:flex; align-items:center;"></ul>
                        <ul id="auth-nav-container" style="list-style:none; margin:0; padding:0; display:flex; align-items:center;"></ul>
                    </div>
                </div>
            </div>
        `;
        document.body.prepend(header);
        this.updateMobileAuth(null);
    }

    updateMobileAuth(user) {
        const slot = document.getElementById('gh-mobile-auth');
        if (!slot) return;
        slot.replaceChildren();

        if (!user || !user.login) {
            const button = document.createElement('button');
            button.type = 'button';
            button.id = 'btn-sign-in-mobile';
            button.className = 'gh-mobile-login';
            button.setAttribute('aria-label', 'Log in with GitHub');
            const full = document.createElement('span');
            full.className = 'gh-mobile-login-full';
            full.textContent = 'Log in with GitHub';
            const short = document.createElement('span');
            short.className = 'gh-mobile-login-short';
            short.textContent = 'Login GitHub';
            button.append(full, short);
            slot.appendChild(button);
            return;
        }

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = 'gh-mobile-account-toggle';
        toggle.className = 'gh-mobile-account-toggle';
        toggle.setAttribute('aria-label', 'Cuenta GitHub: ' + user.login);
        toggle.setAttribute('aria-controls', 'gh-mobile-account-menu');
        toggle.setAttribute('aria-expanded', 'false');
        if (user.avatar_url) {
            const avatar = document.createElement('img');
            avatar.src = user.avatar_url;
            avatar.alt = '';
            avatar.width = 32;
            avatar.height = 32;
            toggle.appendChild(avatar);
        } else {
            const initials = document.createElement('span');
            initials.className = 'gh-mobile-account-initials';
            initials.textContent = user.login.slice(0, 2).toUpperCase();
            toggle.appendChild(initials);
        }

        const menu = document.createElement('div');
        menu.id = 'gh-mobile-account-menu';
        menu.className = 'gh-mobile-account-menu';
        menu.setAttribute('aria-label', 'Opciones de cuenta');
        menu.hidden = true;

        const name = document.createElement('span');
        name.className = 'gh-mobile-account-name';
        name.textContent = user.login;
        menu.appendChild(name);
        const actions = [
            ['btn-open-profile-mobile', 'Mi perfil'],
            ['btn-open-api-config-mobile', 'Configuración API'],
            ['btn-open-settings-mobile', 'Ajustes avanzados'],
            ['btn-logout-mobile', 'Cerrar sesión']
        ];
        for (const [id, label] of actions) {
            const item = document.createElement('button');
            item.type = 'button';
            item.id = id;
            item.textContent = label;
            menu.appendChild(item);
        }
        slot.append(toggle, menu);
    }

    bindEvents() {
        const toggle = document.getElementById('gh-mobile-toggle');
        const content = document.getElementById('gh-nav-content');
        if (toggle && content) {
            toggle.addEventListener('click', () => {
                const isOpen = content.classList.toggle('open');
                toggle.setAttribute('aria-expanded', String(isOpen));
                toggle.setAttribute('aria-label', isOpen ? 'Cerrar menú' : 'Abrir menú');
            });
        }

        document.addEventListener('click', (event) => {
            const account = document.getElementById('gh-mobile-auth');
            const menu = document.getElementById('gh-mobile-account-menu');
            const accountToggle = document.getElementById('gh-mobile-account-toggle');
            if (!account || !menu || !accountToggle) return;
            if (event.target.closest('#gh-mobile-account-toggle')) {
                menu.hidden = !menu.hidden;
                accountToggle.setAttribute('aria-expanded', String(!menu.hidden));
            } else if (!account.contains(event.target) || event.target.closest('.gh-mobile-account-menu button')) {
                menu.hidden = true;
                accountToggle.setAttribute('aria-expanded', 'false');
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') return;
            const menu = document.getElementById('gh-mobile-account-menu');
            const accountToggle = document.getElementById('gh-mobile-account-toggle');
            if (menu && !menu.hidden) {
                menu.hidden = true;
                accountToggle?.setAttribute('aria-expanded', 'false');
                accountToggle?.focus();
            }
        });

        // Auth status update when ready
        document.addEventListener('authReady', (e) => {
            this.updateMobileAuth(e.detail?.user || null);
            if (window.authManager && window.githubApi) {
                // Ensure we only read token via getAuthToken() as requested
                const token = window.githubApi.getAuthToken();
                window.authManager.updateHeaderUI(e.detail.user);
            }
        });
    }

    dispatchReady() {
        document.dispatchEvent(new CustomEvent('hypenosysHeaderReady'));
    }
}

// Global initialization
(function() {
    const init = () => {
        if (!window.hypenosysHeader) {
            window.hypenosysHeader = new GlobalHeader();
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
