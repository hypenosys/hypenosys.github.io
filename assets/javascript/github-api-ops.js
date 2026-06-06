/**
 * GitHub API Operations - Functional & Session-based
 * Dedicated to repository and organization metadata.
 * Uses sessionStorage as primary token source.
 */

(function() {
    const GITHUB_OPS_BASE = 'https://api.github.com';
    const OPS_ORG = 'hypenosys';

    const githubOps = {
        /**
         * Retrieves the token specifically from sessionStorage
         */
        getToken: () => {
            return sessionStorage.getItem('gh_access_token') ||
                   sessionStorage.getItem('github_token');
        },

        getHeaders: () => {
            const token = githubOps.getToken();
            if (!token) return { 'Accept': 'application/vnd.github.v3+json' };
            return {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            };
        },

        /**
         * Fetches all repositories for the Hypenosys organization
         */
        fetchRepositories: async () => {
            const headers = githubOps.getHeaders();
            const response = await fetch(`${GITHUB_OPS_BASE}/orgs/${OPS_ORG}/repos?per_page=100&type=all&sort=full_name`, {
                headers
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(`GitHub API Error: ${response.status} - ${error.message}`);
            }

            const repos = await response.json();
            return repos.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                private: repo.private,
                html_url: repo.html_url,
                updated_at: repo.updated_at,
                archived: repo.archived
            }));
        },

        /**
         * Fetches branches for a specific repository
         */
        fetchBranches: async (repoName) => {
            const headers = githubOps.getHeaders();
            const response = await fetch(`${GITHUB_OPS_BASE}/repos/${OPS_ORG}/${repoName}/branches?per_page=100`, {
                headers
            });

            if (!response.ok) {
                const error = await response.json().catch(() => ({ message: 'Unknown error' }));
                throw new Error(`GitHub API Error: ${response.status} - ${error.message}`);
            }

            return await response.json();
        }
    };

    // Export to window
    window.githubOps = githubOps;
    console.log('[GITHUB-OPS] Library loaded (sessionStorage focus)');
})();
