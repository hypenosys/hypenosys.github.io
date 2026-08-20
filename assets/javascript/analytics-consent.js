/**
 * Hypenosys Privacy & Analytics Consent Manager
 * Integrates with self-hosted Matomo analytics with privacy-first (fail-closed) architecture.
 */

(function () {
    'use strict';

    // Centralized Matomo configuration
    // Site IDs are resolved dynamically based on runtime hostname (same code shared across master & develop).
    const MATOMO_CONFIG = Object.freeze({
        url: 'https://matomo.hypenosys.com/',
        sites: Object.freeze({
            'hypenosys.com': '1',
            'www.hypenosys.com': '1',
            'dev.hypenosys.com': '2'
        })
    });

    const STORAGE_KEY = 'hypenosys_consent_v1';
    const CONSENT_VERSION = 1;

    let matomoInitialized = false;
    let previousActiveElement = null;

    /**
     * Resolve Matomo Site ID based on explicit hostname allowlist.
     * Returns null for unknown hostnames, localhost, hypenosys.github.io, etc.
     */
    function resolveMatomoSiteId() {
        try {
            const hostname = (window.location.hostname || '')
                .toLowerCase()
                .replace(/\.$/, '');
            return MATOMO_CONFIG.sites[hostname] || null;
        } catch (e) {
            console.warn('[Hypenosys Consent] Failed to resolve hostname:', e);
            return null;
        }
    }

    const MATOMO_SITE_ID = resolveMatomoSiteId();

    /**
     * Get saved consent preference object from localStorage.
     * Returns null if unset or invalid.
     */
    function getSavedConsent() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (typeof parsed === 'object' && parsed !== null && parsed.version === CONSENT_VERSION) {
                return parsed;
            }
        } catch (e) {
            console.warn('[Hypenosys Consent] Failed to read localStorage consent state:', e);
        }
        return null;
    }

    /**
     * Persist consent choice to localStorage.
     */
    function saveConsent(analyticsAccepted) {
        const payload = {
            version: CONSENT_VERSION,
            analytics: Boolean(analyticsAccepted),
            updatedAt: Date.now()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {
            console.warn('[Hypenosys Consent] Failed to save consent to localStorage:', e);
        }
        return payload;
    }

    /**
     * Initialize Matomo queue and load matomo.js dynamically ONCE.
     * Fail-closed: strict guard requires MATOMO_SITE_ID !== null.
     */
    function enableMatomoTracking() {
        // Strict Fail-Closed Check: Never initialize tracking on unlisted hostnames
        if (!MATOMO_SITE_ID) {
            return;
        }

        window._paq = window._paq || [];

        if (!matomoInitialized) {
            matomoInitialized = true;

            _paq.push(['requireConsent']);
            _paq.push(['setConsentGiven']);
            _paq.push(['setTrackerUrl', MATOMO_CONFIG.url + 'matomo.php']);
            _paq.push(['setSiteId', MATOMO_SITE_ID]);
            _paq.push(['trackPageView']);
            _paq.push(['enableLinkTracking']);

            if (!window.__hypenosysMatomoLoaded) {
                window.__hypenosysMatomoLoaded = true;
                const d = document;
                const g = d.createElement('script');
                const s = d.getElementsByTagName('script')[0];
                g.async = true;
                g.src = MATOMO_CONFIG.url + 'matomo.js';
                if (s && s.parentNode) {
                    s.parentNode.insertBefore(g, s);
                } else {
                    (d.head || d.body).appendChild(g);
                }
            }
        } else {
            // Already initialized in this page lifecycle, just ensure consent is given
            _paq.push(['setConsentGiven']);
        }
    }

    /**
     * Revoke Matomo tracking and clear cookies.
     */
    function disableMatomoTracking() {
        window._paq = window._paq || [];
        _paq.push(['forgetConsentGiven']);
        _paq.push(['deleteCookies']);
    }

    /**
     * Ensure CSS is present in head
     */
    function ensureStyles() {
        if (!document.getElementById('hy-consent-styles')) {
            const link = document.createElement('link');
            link.id = 'hy-consent-styles';
            link.rel = 'stylesheet';
            link.href = '/assets/css/consent.css';
            document.head.appendChild(link);
        }
    }

    /**
     * Render the Initial Banner UI
     */
    function renderBanner() {
        if (document.getElementById('hy-consent-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'hy-consent-banner';
        banner.className = 'hy-consent-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Aviso de privacidad y galletas');

        banner.innerHTML = `
            <div class="hy-consent-banner-content">
                <div class="hy-consent-banner-text">
                    <h3 class="hy-consent-banner-title">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Privacidad en Hypenosys
                    </h3>
                    <p class="hy-consent-banner-desc">
                        Utilizamos analítica propia y privada (Matomo self-hosted) para mejorar la plataforma. No compartimos datos con terceros ni rastreamos entre sitios. <a href="/privacidad/" target="_blank">Más información</a>.
                    </p>
                </div>
                <div class="hy-consent-banner-actions">
                    <button type="button" id="hy-consent-btn-reject" class="hy-consent-btn hy-consent-btn-reject">
                        Rechazar
                    </button>
                    <button type="button" id="hy-consent-btn-settings" class="hy-consent-btn hy-consent-btn-settings">
                        Configurar
                    </button>
                    <button type="button" id="hy-consent-btn-accept" class="hy-consent-btn hy-consent-btn-accept">
                        Aceptar analíticas
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('hy-consent-btn-accept').addEventListener('click', function () {
            handleAccept();
        });

        document.getElementById('hy-consent-btn-reject').addEventListener('click', function () {
            handleReject();
        });

        document.getElementById('hy-consent-btn-settings').addEventListener('click', function () {
            openModal();
        });
    }

    function removeBanner() {
        const banner = document.getElementById('hy-consent-banner');
        if (banner) banner.remove();
    }

    /**
     * Render and manage Preferences Modal UI
     */
    function renderModal() {
        if (document.getElementById('hy-consent-modal-overlay')) return;

        const consent = getSavedConsent();
        const isAnalyticsActive = consent ? consent.analytics === true : false;

        const overlay = document.createElement('div');
        overlay.id = 'hy-consent-modal-overlay';
        overlay.className = 'hy-consent-modal-overlay hy-consent-hidden';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'hy-consent-modal-title');

        overlay.innerHTML = `
            <div class="hy-consent-modal" id="hy-consent-modal">
                <div class="hy-consent-modal-header">
                    <h3 class="hy-consent-modal-title" id="hy-consent-modal-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        Preferencias de Privacidad
                    </h3>
                    <button type="button" class="hy-consent-modal-close" id="hy-consent-modal-close" aria-label="Cerrar panel de preferencias">&times;</button>
                </div>
                <div class="hy-consent-modal-body">
                    <p class="hy-consent-banner-desc">
                        Gestiona tus preferencias de privacidad. Las tecnologías necesarias garantizan el funcionamiento básico de la plataforma y el almacenamiento seguro de esta elección.
                    </p>

                    <!-- Necesarias -->
                    <div class="hy-consent-option-card">
                        <div class="hy-consent-option-header">
                            <h4 class="hy-consent-option-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                Almacenamiento Necesario
                            </h4>
                            <span class="hy-consent-badge-always">Siempre Activo</span>
                        </div>
                        <p class="hy-consent-option-desc">
                            Permite recordar tus configuraciones, autenticación y esta preferencia de privacidad. No recoge datos analíticos ni personales.
                        </p>
                    </div>

                    <!-- Analíticas -->
                    <div class="hy-consent-option-card">
                        <div class="hy-consent-option-header">
                            <h4 class="hy-consent-option-title">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                                Analíticas y Estadísticas (Matomo)
                            </h4>
                            <label class="hy-consent-switch-label" for="hy-consent-toggle-analytics">
                                <input type="checkbox" id="hy-consent-toggle-analytics" ${isAnalyticsActive ? 'checked' : ''}>
                                <span class="hy-consent-slider"></span>
                            </label>
                        </div>
                        <p class="hy-consent-option-desc">
                            Matomo self-hosted por Hypenosys con IP anonimizada. Nos ayuda a entender el uso de la web y mejorar las herramientas sin vender ni compartir información con terceros.
                        </p>
                    </div>

                    <div style="font-size: 0.8rem;">
                        <a href="/privacidad/" target="_blank" style="color: var(--hy-consent-purple); text-decoration: underline;">
                            Ver Política de Privacidad completa
                        </a>
                    </div>
                </div>
                <div class="hy-consent-modal-footer">
                    <button type="button" id="hy-consent-modal-btn-reject" class="hy-consent-btn hy-consent-btn-reject">
                        Rechazar
                    </button>
                    <button type="button" id="hy-consent-modal-btn-save" class="hy-consent-btn hy-consent-btn-settings">
                        Guardar preferencias
                    </button>
                    <button type="button" id="hy-consent-modal-btn-accept" class="hy-consent-btn hy-consent-btn-accept">
                        Aceptar analíticas
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('hy-consent-modal-close').addEventListener('click', closeModal);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal();
        });

        document.getElementById('hy-consent-modal-btn-accept').addEventListener('click', function () {
            handleAccept();
            closeModal();
        });

        document.getElementById('hy-consent-modal-btn-reject').addEventListener('click', function () {
            handleReject();
            closeModal();
        });

        document.getElementById('hy-consent-modal-btn-save').addEventListener('click', function () {
            const toggle = document.getElementById('hy-consent-toggle-analytics');
            if (toggle && toggle.checked) {
                handleAccept();
            } else {
                handleReject();
            }
            closeModal();
        });

        // Keydown handler for Escape & Trap Focus
        overlay.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeModal();
                return;
            }

            if (e.key === 'Tab') {
                const focusables = overlay.querySelectorAll('button, input, a, [tabindex]:not([tabindex="-1"])');
                if (!focusables.length) return;

                const firstEl = focusables[0];
                const lastEl = focusables[focusables.length - 1];

                if (e.shiftKey && document.activeElement === firstEl) {
                    e.preventDefault();
                    lastEl.focus();
                } else if (!e.shiftKey && document.activeElement === lastEl) {
                    e.preventDefault();
                    firstEl.focus();
                }
            }
        });
    }

    function openModal() {
        previousActiveElement = document.activeElement;
        renderModal();

        const overlay = document.getElementById('hy-consent-modal-overlay');
        const toggle = document.getElementById('hy-consent-toggle-analytics');
        const consent = getSavedConsent();

        if (toggle) {
            toggle.checked = consent ? consent.analytics === true : false;
        }

        if (overlay) {
            overlay.classList.remove('hy-consent-hidden');
            const closeBtn = document.getElementById('hy-consent-modal-close');
            if (closeBtn) closeBtn.focus();
        }
    }

    function closeModal() {
        const overlay = document.getElementById('hy-consent-modal-overlay');
        if (overlay) {
            overlay.classList.add('hy-consent-hidden');
        }
        if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
            previousActiveElement.focus();
        }
    }

    /**
     * Handlers for User Actions
     */
    function handleAccept() {
        saveConsent(true);
        removeBanner();
        enableMatomoTracking();
    }

    function handleReject() {
        saveConsent(false);
        removeBanner();
        disableMatomoTracking();
    }

    /**
     * Ensure persistent trigger control ("Configurar privacidad") is bound or created.
     */
    function setupTriggerLinks() {
        // Bind existing trigger elements with data-hy-consent-trigger or class hy-consent-trigger
        const triggers = document.querySelectorAll('[data-hy-consent-trigger], .hy-consent-trigger');
        triggers.forEach(el => {
            if (!el.dataset.hyConsentBound) {
                el.dataset.hyConsentBound = 'true';
                el.addEventListener('click', function (e) {
                    e.preventDefault();
                    openModal();
                });
            }
        });

        // If no explicit trigger was found on the page or in footer, render floating control
        if (triggers.length === 0 && !document.getElementById('hy-consent-floating-trigger')) {
            const floatBtn = document.createElement('button');
            floatBtn.id = 'hy-consent-floating-trigger';
            floatBtn.className = 'hy-consent-floating-trigger';
            floatBtn.setAttribute('type', 'button');
            floatBtn.setAttribute('aria-label', 'Configurar preferencias de privacidad');
            floatBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Privacidad
            `;
            floatBtn.addEventListener('click', openModal);
            document.body.appendChild(floatBtn);
        }
    }

    /**
     * Main Init Loop
     */
    function init() {
        ensureStyles();

        const consent = getSavedConsent();

        if (consent && consent.analytics === true) {
            // Consent previously accepted
            enableMatomoTracking();
        } else if (consent && consent.analytics === false) {
            // Consent previously rejected
            disableMatomoTracking();
        } else {
            // Unset / first visit -> fail-closed
            disableMatomoTracking();
            renderBanner();
        }

        setupTriggerLinks();
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose minimal public API
    window.HypenosysConsent = {
        getConsentState: getSavedConsent,
        acceptAnalytics: handleAccept,
        rejectAnalytics: handleReject,
        openPreferences: openModal,
        closePreferences: closeModal,
        getMatomoConfig: () => ({ ...MATOMO_CONFIG }),
        getResolvedSiteId: () => MATOMO_SITE_ID
    };

})();
