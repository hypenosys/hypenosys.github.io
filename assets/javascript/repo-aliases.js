/**
 * Repository Alias Management for Hypenosys Hub
 * Persists user-defined aliases in localStorage.
 */

const REPO_ALIASES_KEY = 'hypenosys_repo_aliases';

/**
 * Gets all aliases from localStorage.
 * @returns {Object} Mapping of repoFullName to alias.
 */
function _getAllAliases() {
    try {
        const stored = localStorage.getItem(REPO_ALIASES_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch (e) {
        console.error('Error reading repo aliases from localStorage:', e);
        return {};
    }
}

/**
 * Gets the alias for a specific repository.
 * @param {string} repoFullName - Real repository identifier (e.g., sources/github/owner/repo).
 * @returns {string|null} The alias or null if not set.
 */
function getRepoAlias(repoFullName) {
    if (!repoFullName) return null;
    const aliases = _getAllAliases();
    return aliases[repoFullName] || null;
}

/**
 * Sets the alias for a specific repository.
 * @param {string} repoFullName - Real repository identifier.
 * @param {string} alias - The new alias.
 */
function setRepoAlias(repoFullName, alias) {
    if (!repoFullName || !alias) return;

    // Validation
    const cleanAlias = alias.trim().substring(0, 60);
    if (!cleanAlias) return;

    const aliases = _getAllAliases();
    aliases[repoFullName] = cleanAlias;
    localStorage.setItem(REPO_ALIASES_KEY, JSON.stringify(aliases));
}

/**
 * Removes the alias for a specific repository.
 * @param {string} repoFullName - Real repository identifier.
 */
function removeRepoAlias(repoFullName) {
    if (!repoFullName) return;
    const aliases = _getAllAliases();
    delete aliases[repoFullName];
    localStorage.setItem(REPO_ALIASES_KEY, JSON.stringify(aliases));
}

/**
 * Gets the display name for a repository (alias if exists, otherwise original name).
 * @param {string} repoFullName - Real repository identifier.
 * @param {string} originalName - Original name to fallback to.
 * @returns {string} The name to display.
 */
function getRepoDisplayName(repoFullName, originalName) {
    const alias = getRepoAlias(repoFullName);
    return alias || originalName || repoFullName;
}

// Expose to window
window.getRepoAlias = getRepoAlias;
window.setRepoAlias = setRepoAlias;
window.removeRepoAlias = removeRepoAlias;
window.getRepoDisplayName = getRepoDisplayName;
