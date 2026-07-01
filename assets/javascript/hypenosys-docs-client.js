/**
 * HYPENOSYS DOCS CLIENT
 * Centralized GitHub API interactions for the hypenosys/docs repository.
 */
window.HypenosysDocsClient = (function() {
    const REPO_OWNER = 'hypenosys';
    const REPO_NAME = 'docs';
    const DEFAULT_BRANCH = 'master';
    const GITHUB_API = 'https://api.github.com';

    /**
     * Get GitHub Auth Headers
     */
    function getHeaders() {
        const token = sessionStorage.getItem('gh_access_token') ||
                     localStorage.getItem('gh_access_token') ||
                     localStorage.getItem('github_token');

        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        if (token && token.length > 10) {
            headers['Authorization'] = `Bearer ${token.trim()}`;
        }
        return headers;
    }

    /**
     * Fetch the latest commit SHA of the master branch
     */
    async function getLatestCommitSha() {
        try {
            const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/commits/${DEFAULT_BRANCH}`;
            const response = await fetch(url, { headers: getHeaders() });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            return data.sha;
        } catch (error) {
            console.error('[DocsClient] Error fetching latest SHA:', error);
            return null;
        }
    }

    /**
     * Fetch repository contents for a specific path
     */
    async function fetchContents(path = '') {
        const encodedPath = path.split('/').map(p => encodeURIComponent(p)).join('/');
        const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${DEFAULT_BRANCH}`;
        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${response.status}`);
        }
        return await response.json();
    }

    /**
     * Fetch the entire file tree recursively
     */
    async function fetchFullTree() {
        const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${DEFAULT_BRANCH}?recursive=1`;
        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return data.tree;
    }

    /**
     * Fetch raw file content and decode from base64
     */
    async function fetchRawFile(path) {
        const encodedPath = path.split('/').map(p => encodeURIComponent(p)).join('/');
        const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${encodedPath}?ref=${DEFAULT_BRANCH}`;
        const response = await fetch(url, { headers: getHeaders() });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (Array.isArray(data)) throw new Error('Path is a directory, not a file.');

        // Decode Base64 (handling UTF-8)
        const binary = atob(data.content.replace(/\n/g, ''));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return new TextDecoder().decode(bytes);
    }

    /**
     * Helper to get raw URL for assets
     */
    function getRawUrl(path) {
        return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${DEFAULT_BRANCH}/${path}`;
    }

    return {
        REPO_OWNER,
        REPO_NAME,
        DEFAULT_BRANCH,
        getLatestCommitSha,
        fetchContents,
        fetchFullTree,
        fetchRawFile,
        getRawUrl
    };
})();
