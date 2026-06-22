/* ════════════════════════════════════════
   HYPENOSYS DOCS CONTEXT
   ════════════════════════════════════════ */
class HypenosysDocsContext {
    constructor() {
        this.REPO = 'hypenosys/docs';
        this.API_BASE = `https://api.github.com/repos/${this.REPO}`;
        this.cache = new Map();
        this.lastCommitSha = null;
        this.POLL_INTERVAL = 60000; // 60s
        this._poller = null;
    }

    getHeaders() {
        const headers = { 'Accept': 'application/vnd.github.v3+json' };
        const token = window.AuthManager?.getValidToken?.() || window.githubApi?.getAuthToken?.();
        if (token) {
            headers['Authorization'] = `token ${token}`;
        }
        return headers;
    }

    async getLatestCommitSha() {
        try {
            const r = await fetch(`${this.API_BASE}/commits/HEAD`, { headers: this.getHeaders() });
            if (!r.ok) return null;
            const d = await r.json();
            return d.sha;
        } catch (e) {
            return null;
        }
    }

    async hasNewCommits() {
        const sha = await this.getLatestCommitSha();
        if (!sha) return false;
        if (sha !== this.lastCommitSha) {
            this.lastCommitSha = sha;
            this.cache.clear(); // Invalidar cache al detectar cambios
            return true;
        }
        return false;
    }

    async listFiles(path = '') {
        const cacheKey = `list:${path}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        try {
            const r = await fetch(`${this.API_BASE}/contents/${path}`, { headers: this.getHeaders() });
            if (!r.ok) return [];
            const files = await r.json();
            this.cache.set(cacheKey, files);
            return files;
        } catch (e) {
            return [];
        }
    }

    async readFile(path) {
        const cacheKey = `file:${path}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        try {
            const r = await fetch(`${this.API_BASE}/contents/${path}`, { headers: this.getHeaders() });
            if (!r.ok) return null;
            const d = await r.json();
            const content = atob(d.content.replace(/\n/g, ''));
            this.cache.set(cacheKey, content);
            return content;
        } catch (e) {
            return null;
        }
    }

    async buildContextSnapshot(maxFiles = 10) {
        this.updateStatus('syncing');
        try {
            // Leer el árbol de archivos y los primeros N documentos
            const files = await this.listFiles('');
            const mdFiles = files.filter(f => f.name.endsWith('.md') || f.type === 'dir').slice(0, maxFiles);

            let context = `## Repositorio hypenosys/docs (snapshot ${new Date().toISOString()})\n\n`;

            for (const f of mdFiles) {
                if (f.type === 'file') {
                    const content = await this.readFile(f.path);
                    if (content) {
                        context += `### ${f.path}\n${content.slice(0, 2000)}\n\n`;
                    }
                }
            }
            this.updateStatus('live');
            return context;
        } catch (e) {
            this.updateStatus('error');
            return "";
        }
    }

    startPolling(onUpdate) {
        this.updateStatus('live');
        this._poller = setInterval(async () => {
            const changed = await this.hasNewCommits();
            if (changed && onUpdate) onUpdate();
        }, this.POLL_INTERVAL);
    }

    stopPolling() {
        if (this._poller) clearInterval(this._poller);
    }

    updateStatus(status) {
        const badge = document.getElementById('docs-status-badge');
        if (!badge) return;

        badge.className = 'flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold border transition-all';

        if (status === 'live') {
            badge.classList.add('bg-[#50fa7b]/10', 'text-[#50fa7b]', 'border-[#50fa7b]/20');
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#50fa7b]"></span> docs: live';
        } else if (status === 'syncing') {
            badge.classList.add('bg-[#f1fa8c]/10', 'text-[#f1fa8c]', 'border-[#f1fa8c]/20');
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#f1fa8c] animate-pulse"></span> docs: syncing';
        } else if (status === 'error') {
            badge.classList.add('bg-[#ff5555]/10', 'text-[#ff5555]', 'border-[#ff5555]/20');
            badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ff5555]"></span> docs: error';
        }
    }
}

window.docsContext = new HypenosysDocsContext();
