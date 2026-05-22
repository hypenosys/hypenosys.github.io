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

        // Standard styling: circular, dark border, shadow
        const baseClasses = "inline-block rounded-full border-2 border-slate-800 shadow-sm object-cover";
        const sizeClasses = "w-8 h-8 md:w-9 md:h-9";

        if (avatarUrl) {
            return `<img src="${avatarUrl}" alt="${login}" class="${baseClasses} ${sizeClasses} bg-slate-800">`;
        } else {
            return `
                <div class="${baseClasses} ${sizeClasses} bg-slate-900 flex items-center justify-center text-[10px] font-bold text-slate-400">
                    ${initials}
                </div>
            `;
        }
    }
};

window.HypenosysUI = UI;
