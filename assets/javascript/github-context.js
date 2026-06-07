/**
 * GitHub Context Module - Functional with Caching & Queueing
 * Org: hypenosys
 */

(function() {
    const GITHUB_API_BASE = 'https://api.github.com';
    const ORG_NAME = 'hypenosys';
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // Internal State
    const state = {
        queue: [],
        isProcessing: false,
        rateLimitRemaining: 5000,
        rateLimitReset: 0,
        cache: new Map()
    };

    /**
     * Helper: Get Auth Token (Unified logic)
     */
    function getAuthToken() {
        // Unified key: gh_access_token (checks session then local)
        // Fallback to localStorage('github_token') for legacy support
        const token = sessionStorage.getItem('gh_access_token')
            || localStorage.getItem('gh_access_token')
            || localStorage.getItem('github_token');
        return (token && token.length > 10) ? token.trim() : null;
    }

    /**
     * Helper: Update rate limit info from headers
     */
    function updateRateLimit(headers) {
        const remaining = headers.get('X-RateLimit-Remaining');
        const reset = headers.get('X-RateLimit-Reset');
        if (remaining) state.rateLimitRemaining = parseInt(remaining, 10);
        if (reset) state.rateLimitReset = parseInt(reset, 10) * 1000;

        // Dispatch global event for UI awareness
        window.dispatchEvent(new CustomEvent('ghRateLimitUpdate', {
            detail: { remaining: state.rateLimitRemaining, reset: state.rateLimitReset }
        }));
    }

    /**
     * Request Queue & Retry Logic
     */
    async function enqueueRequest(url, options = {}, retryCount = 0) {
        return new Promise((resolve, reject) => {
            state.queue.push({ url, options, retryCount, resolve, reject });
            processQueue();
        });
    }

    async function processQueue() {
        if (state.isProcessing || state.queue.length === 0) return;

        // Check rate limit
        if (state.rateLimitRemaining <= 0 && Date.now() < state.rateLimitReset) {
            console.warn('[GH-CONTEXT] Rate limit hit. Waiting for reset...');
            return;
        }

        state.isProcessing = true;
        const request = state.queue.shift();

        try {
            const token = getAuthToken();
            const headers = {
                'Accept': 'application/vnd.github.v3+json',
                ...request.options.headers
            };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(request.url, { ...request.options, headers });
            updateRateLimit(response.headers);

            if (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') {
                // Rate limit error
                state.queue.unshift(request); // Put back
                state.isProcessing = false;
                return;
            }

            if (!response.ok) {
                if (response.status >= 500 && request.retryCount < 3) {
                    // Exponential backoff retry
                    const delay = Math.pow(2, request.retryCount) * 1000;
                    setTimeout(() => {
                        request.retryCount++;
                        state.queue.unshift(request);
                        processQueue();
                    }, delay);
                    state.isProcessing = false;
                    return;
                }
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            request.resolve(data);
        } catch (err) {
            request.reject(err);
        } finally {
            state.isProcessing = false;
            // Small delay between requests to be nice
            setTimeout(() => processQueue(), 50);
        }
    }

    /**
     * Cache Wrapper
     */
    async function fetchWithCache(key, url, options = {}) {
        const cached = state.cache.get(key);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            return cached.data;
        }

        const data = await enqueueRequest(url, options);
        state.cache.set(key, { data, timestamp: Date.now() });
        return data;
    }

    const githubContext = {
        getAuthToken,
        /**
         * getRepos() -> List org repos
         */
        getRepos: async () => {
            const key = 'org_repos';
            const url = `${GITHUB_API_BASE}/orgs/${ORG_NAME}/repos?per_page=100&sort=pushed&type=all`;
            const repos = await fetchWithCache(key, url);
            return repos.map(repo => ({
                id: repo.id,
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                default_branch: repo.default_branch,
                pushed_at: repo.pushed_at,
                updated_at: repo.updated_at,
                language: repo.language,
                topics: repo.topics || [],
                private: repo.private,
                html_url: repo.html_url,
                owner: repo.owner.login
            }));
        },

        /**
         * getBranches(repo, owner)
         */
        getBranches: async (repoName, owner = ORG_NAME) => {
            const key = `branches_${owner}_${repoName}`;
            const url = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/branches?per_page=100`;
            const branches = await fetchWithCache(key, url);

            // Fetch last commit for each branch in parallel
            return await Promise.all(branches.map(async b => {
                const commitInfo = await githubContext.getCommit(repoName, b.commit.sha, owner);
                return {
                    name: b.name,
                    protected: b.protected,
                    last_commit: {
                        sha: b.commit.sha,
                        message: commitInfo.commit.message,
                        author: commitInfo.commit.author.name,
                        date: commitInfo.commit.author.date
                    }
                };
            }));
        },

        /**
         * getCommit(repo, sha, owner)
         */
        getCommit: async (repoName, sha, owner = ORG_NAME) => {
            const key = `commit_${owner}_${repoName}_${sha}`;
            const url = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/commits/${sha}`;
            return await fetchWithCache(key, url);
        },

        /**
         * getPRs(repo, owner)
         */
        getPRs: async (repoName, owner = ORG_NAME) => {
            const key = `prs_${owner}_${repoName}`;
            const url = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/pulls?state=open&per_page=50`;
            const prs = await fetchWithCache(key, url);
            return prs.map(pr => ({
                number: pr.number,
                title: pr.title,
                author: pr.user.login,
                head: pr.head.ref,
                base: pr.base.ref,
                labels: pr.labels.map(l => l.name),
                html_url: pr.html_url,
                updated_at: pr.updated_at,
                draft: pr.draft
            }));
        },

        /**
         * getCommits(repo, branch, limit, owner)
         */
        getCommits: async (repoName, branch = 'master', limit = 10, owner = ORG_NAME) => {
            const key = `commits_${owner}_${repoName}_${branch}_${limit}`;
            const url = `${GITHUB_API_BASE}/repos/${owner}/${repoName}/commits?sha=${branch}&per_page=${limit}`;
            const commits = await fetchWithCache(key, url);
            return commits.map(c => ({
                sha: c.sha,
                short_sha: c.sha.substring(0, 7),
                message: c.commit.message,
                author: c.commit.author.name,
                author_login: c.author ? c.author.login : null,
                date: c.commit.author.date,
                html_url: c.html_url
            }));
        },

        /**
         * getRepoContext(repo, owner)
         */
        getRepoContext: async (repoName, owner = ORG_NAME) => {
            const [repos, prs, branches] = await Promise.all([
                githubContext.getRepos(), // Still mostly org focused for now
                githubContext.getPRs(repoName, owner),
                githubContext.getBranches(repoName, owner)
            ]);
            const repo = repos.find(r => r.name === repoName);
            return {
                repo,
                prs,
                branches
            };
        },

        /**
         * searchAcrossRepos(query)
         */
        searchAcrossRepos: async (query) => {
            const repos = await githubContext.getRepos();
            const q = query.toLowerCase();
            return repos.filter(r =>
                r.name.toLowerCase().includes(q) ||
                (r.description && r.description.toLowerCase().includes(q)) ||
                r.topics.some(t => t.toLowerCase().includes(q))
            );
        }
    };

    window.githubContext = githubContext;
    console.log('[GH-CONTEXT] Loaded');
})();
