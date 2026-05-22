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
