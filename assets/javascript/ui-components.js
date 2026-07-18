/**
 * UI Components for Hypenosys Operations Hub
 */

const UI = {
    /**
     * Renders a circular avatar with a GitHub profile photo or fallback initials.
     * @param {Object} user - The user object from GitHub API.
     * @returns {string} - HTML string for the avatar component.
     */
    renderAvatar(user) {
        if (!user) return '';

        const avatarUrl = user.avatar_url;
        const login = user.login || 'User';
        const initials = login.substring(0, 2).toUpperCase();

        // Constrained styles for Bug #1
        const containerStyle = "width: 32px; height: 32px; max-width: 32px; max-height: 32px; overflow: hidden; border: 2px solid rgba(139, 92, 246, 0.6); border-radius: 9999px; flex-shrink: 0; display: inline-block;";
        const imgStyle = "width: 32px; height: 32px; object-fit: cover; border-radius: 9999px; display: block;";

        if (avatarUrl) {
            return `
                <div style="${containerStyle}" class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                    <img src="${avatarUrl}" alt="${login}" style="${imgStyle}" class="w-full h-full object-cover">
                </div>
            `;
        } else {
            return `
                <div style="${containerStyle}" class="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-400">
                    ${initials}
                </div>
            `;
        }
    }
};

window.HypenosysUI = UI;

/**
 * IMPROVEMENT 1 — Toast notification system (global)
 */
window.hypeToast = function(message, type = 'info', duration = 3000) {
    const container = document.getElementById('hype-toast-container');
    if (!container) {
        console.warn('Toast container not found. Make sure <div id="hype-toast-container"></div> exists.');
        return;
    }

    // Limit to max 4 toasts
    while (container.children.length >= 4) {
        container.removeChild(container.firstChild);
    }

    const toast = document.createElement('div');
    toast.className = `hype-toast hype-toast--${type} pointer-events-auto`;

    const colors = {
        success: '#50fa7b',
        error: '#ff5555',
        warning: '#f1fa8c',
        info: '#8be9fd'
    };

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };

    toast.style.borderLeftColor = colors[type] || colors.info;

    toast.innerHTML = `
        <div class="flex items-center gap-3">
            <i class="fa-solid ${icons[type] || icons.info}" style="color: ${colors[type] || colors.info}"></i>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('hype-toast--visible'), 10);

    // Auto-dismiss
    setTimeout(() => {
        toast.classList.remove('hype-toast--visible');
        setTimeout(() => {
            if (toast.parentNode === container) {
                container.removeChild(toast);
            }
        }, 400);
    }, duration);
};

/**
 * IMPROVEMENT 2 — Relative timestamps (Spanish)
 */
window.timeAgo = function(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'hace unos segundos';

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `hace ${minutes} minuto${minutes > 1 ? 's' : ''}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `hace ${hours} hora${hours > 1 ? 's' : ''}`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'ayer';
    if (days < 7) return `hace ${days} día${days > 1 ? 's' : ''}`;

    return date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

window.formatDate = function(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    const datePart = date.toLocaleDateString('es-ES', options).replace('.', '');
    const timePart = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${datePart} · ${timePart}`;
};

/**
 * ZROK & CORS UTILITIES
 * Canonically handles zrok public share bypass and interstitial detection.
 */
window.isZrokUrl = function(url) {
    if (!url) return false;
    try {
        const u = new URL(url);
        return u.hostname.endsWith('.shares.zrok.io') || u.hostname.endsWith('.share.zrok.io');
    } catch (e) {
        // Fallback simple check in case of relative URL or parse failure
        return url.includes('.shares.zrok.io') || url.includes('.share.zrok.io');
    }
};

window.getZrokHeaders = function(url, existingHeaders = {}) {
    const headers = {};

    // Normalize existing headers into a plain object with lowercase keys
    if (existingHeaders instanceof Headers) {
        existingHeaders.forEach((value, key) => {
            headers[key.toLowerCase()] = value;
        });
    } else if (existingHeaders && typeof existingHeaders === 'object') {
        Object.keys(existingHeaders).forEach(key => {
            headers[key.toLowerCase()] = existingHeaders[key];
        });
    }

    if (window.isZrokUrl(url)) {
        headers['skip_zrok_interstitial'] = 'true';
    }

    // Convert back to capitalized/standard form if they were input as such
    const finalHeaders = {};
    Object.keys(headers).forEach(key => {
        // Keep standard casing for common headers
        if (key === 'content-type') finalHeaders['Content-Type'] = headers[key];
        else if (key === 'authorization') finalHeaders['Authorization'] = headers[key];
        else if (key === 'accept') finalHeaders['Accept'] = headers[key];
        else finalHeaders[key] = headers[key];
    });

    return finalHeaders;
};

window.hypenosysFetch = async function(url, options = {}) {
    options = { ...options };
    options.headers = window.getZrokHeaders(url, options.headers || {});

    const response = await fetch(url, options);

    // Detección explícita del interstitial de zrok
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
        const clone = response.clone();
        const htmlText = await clone.text();
        if (htmlText.includes('zrok') && (htmlText.includes('interstitial') || htmlText.includes('advertencia') || htmlText.includes('warning') || htmlText.includes('public share'))) {
            throw new Error('ZROK_INTERSTITIAL_BLOCKED');
        }
    }

    return response;
};
