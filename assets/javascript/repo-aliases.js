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
    if (!repoFullName) return originalName || '';

    // Standardize possible formats to check for an alias
    // 1. sources/github-owner-repo (New Jules format)
    // 2. sources/github/owner/repo (Old format)
    // 3. owner/repo (GitHub format)

    let owner, repo;

    if (repoFullName.startsWith('sources/github-')) {
        const parts = repoFullName.replace('sources/github-', '').split('-');
        owner = parts[0];
        repo = parts.slice(1).join('-');
    } else if (repoFullName.startsWith('sources/github/')) {
        const parts = repoFullName.replace('sources/github/', '').split('/');
        owner = parts[0];
        repo = parts.slice(1).join('/');
    } else if (repoFullName.includes('/')) {
        const parts = repoFullName.split('/');
        owner = parts[0];
        repo = parts.slice(1).join('/');
    }

    if (owner && repo) {
        const hyphenated = `sources/github-${owner}-${repo}`;
        const slashed = `sources/github/${owner}/${repo}`;
        const gh = `${owner}/${repo}`;

        const alias = getRepoAlias(hyphenated) || getRepoAlias(slashed) || getRepoAlias(gh);
        if (alias) return alias;
    }

    // Try exact match as last resort
    const directAlias = getRepoAlias(repoFullName);
    if (directAlias) return directAlias;

    return originalName || repo || repoFullName;
}

// Expose to window
window.getRepoAlias = getRepoAlias;
window.setRepoAlias = setRepoAlias;
window.removeRepoAlias = removeRepoAlias;
window.getRepoDisplayName = getRepoDisplayName;
