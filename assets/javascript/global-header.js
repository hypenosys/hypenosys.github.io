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
        this.render();
        this.bindEvents();
        this.dispatchReady();
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
                background: none;
                border: 1px solid var(--gh-border);
                color: var(--gh-text);
                padding: 0.5rem;
                border-radius: 6px;
                cursor: pointer;
            }

            @media (max-width: 900px) {
                .gh-navbar { padding: 0 1rem; }
                .gh-container { gap: 0.75rem; }
                .gh-dropdown-toggle { font-size: 9px; padding: 0.5rem 0.4rem; }
            }

            @media (max-width: 750px) {
                .gh-mobile-toggle { display: block; }
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
        `;
        document.head.appendChild(style);
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

                <button class="gh-mobile-toggle" id="gh-mobile-toggle">
                    <i class="fas fa-bars"></i>
                </button>

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

                    <div class="gh-auth-section">
                        <ul id="auth-nav-container-left" style="list-style:none; margin:0; padding:0; display:flex; align-items:center;"></ul>
                        <ul id="auth-nav-container" style="list-style:none; margin:0; padding:0; display:flex; align-items:center;"></ul>
                    </div>
                </div>
            </div>
        `;
        document.body.prepend(header);
    }

    bindEvents() {
        const toggle = document.getElementById('gh-mobile-toggle');
        const content = document.getElementById('gh-nav-content');
        if (toggle && content) {
            toggle.addEventListener('click', () => content.classList.toggle('open'));
        }

        // Auth status update when ready
        document.addEventListener('authReady', (e) => {
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
