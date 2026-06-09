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
            // Unified key: gh_access_token (checks session then local)
            // Fallback to localStorage('github_token') for legacy support
            return sessionStorage.getItem('gh_access_token') ||
                   localStorage.getItem('gh_access_token') ||
                   localStorage.getItem('github_token');
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

    /**
     * ATOMIC TASK MANAGEMENT (Bloque 2)
     */
    window.taskOps = {
        FILE_PATH: '_data/dashboard_tasks.json',

        /**
         * createTask(task)
         */
        createTask: async (task) => {
            return await window.githubApi.atomicWrite(window.taskOps.FILE_PATH, (db) => {
                const now = new Date().toISOString();
                const newTask = {
                    ...task,
                    id: task.id || `TASK-${Date.now()}`,
                    created_at: now,
                    updated_at: now,
                    jules_loop_estado: task.jules_loop_estado || 'sin_loop'
                };
                if (!db.tasks) db.tasks = [];
                db.tasks.push(newTask);
                db.last_updated = now;
                return db;
            }, `feat: nueva tarea ${task.titulo}`);
        },

        /**
         * updateTask(taskId, delta)
         */
        updateTask: async (taskId, delta) => {
            return await window.githubApi.atomicWrite(window.taskOps.FILE_PATH, (db) => {
                // Fix: robust comparison for different ID formats
                const idx = db.tasks.findIndex(t => String(t.id) === String(taskId));
                if (idx === -1) throw new Error(`Tarea ${taskId} no encontrada`);

                db.tasks[idx] = {
                    ...db.tasks[idx],
                    ...delta,
                    updated_at: new Date().toISOString()
                };
                db.last_updated = new Date().toISOString();
                return db;
            }, `chore: actualizar tarea ${taskId}`);
        },

        /**
         * getAllTasks()
         */
        getAllTasks: async () => {
            const { content } = await window.githubApi.fetchFileWithSha(window.taskOps.FILE_PATH);
            return content.tasks || [];
        },

        /**
         * getActivities() - Mocked for now, should connect to real activity log
         */
        getActivities: async () => {
            return [
                { timestamp: new Date().toISOString(), message: "Neural Session link established", status: "ready" }
            ];
        }
    };

    console.log('[GITHUB-OPS] Library loaded (sessionStorage focus)');
})();
