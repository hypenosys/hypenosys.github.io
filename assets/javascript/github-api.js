/**
 * GitHub API Interaction Module
 * Handles authentication, fetching issues, and updating issue states.
 */

class GitHubAPI {
    constructor() {
        this.baseUrl = 'https://api.github.com';
        this.token = localStorage.getItem('github_pat');
        this.repo = localStorage.getItem('github_repo') || 'hypenosys/hypenosys.github.io';
        this.user = null;
        this.rateLimit = {
            limit: 5000,
            remaining: 5000,
            reset: 0
        };
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('github_pat', token);
    }

    setRepo(repo) {
        this.repo = repo;
        localStorage.setItem('github_repo', repo);
    }

    getHeaders() {
        const headers = {
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        };
        if (this.token) {
            headers['Authorization'] = `token ${this.token}`;
        }
        return headers;
    }

    async updateRateLimit(response) {
        const limit = response.headers.get('x-ratelimit-limit');
        const remaining = response.headers.get('x-ratelimit-remaining');
        const reset = response.headers.get('x-ratelimit-reset');

        if (limit) this.rateLimit.limit = parseInt(limit);
        if (remaining) this.rateLimit.remaining = parseInt(remaining);
        if (reset) this.rateLimit.reset = parseInt(reset);

        // Dispatch event for UI to update rate limit indicator
        window.dispatchEvent(new CustomEvent('github-ratelimit-update', { detail: this.rateLimit }));
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        const response = await fetch(url, {
            ...options,
            headers: { ...this.getHeaders(), ...options.headers }
        });

        await this.updateRateLimit(response);

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || `GitHub API error: ${response.status}`);
        }

        if (response.status === 204) return null;
        return response.json();
    }

    async validateToken() {
        if (!this.token) return null;
        try {
            this.user = await this.request('/user');
            return this.user;
        } catch (e) {
            console.error('Token validation failed:', e);
            return null;
        }
    }

    async fetchIssues() {
        // Fetch open issues (all statuses except closed)
        const openIssues = await this.request(`/repos/${this.repo}/issues?state=open&per_page=100`);
        // Fetch closed issues (for the 'Done' column)
        const closedIssues = await this.request(`/repos/${this.repo}/issues?state=closed&per_page=100`);

        // Combine and return
        return [...openIssues, ...closedIssues].filter(issue => !issue.pull_request);
    }

    async updateIssue(issueNumber, data) {
        return this.request(`/repos/${this.repo}/issues/${issueNumber}`, {
            method: 'PATCH',
            body: JSON.stringify(data)
        });
    }

    async autoAssign(issueNumber) {
        if (!this.user) {
            await this.validateToken();
        }
        if (!this.user) throw new Error('Not authenticated');

        return this.updateIssue(issueNumber, {
            assignees: [this.user.login]
        });
    }

    async updateStatus(issueNumber, status) {
        // status: backlog, todo, in-progress, qa, done

        if (status === 'done') {
            return this.updateIssue(issueNumber, {
                state: 'closed'
            });
        }

        // Fetch current labels to remove existing status labels
        const issue = await this.request(`/repos/${this.repo}/issues/${issueNumber}`);
        const otherLabels = issue.labels
            .map(l => typeof l === 'string' ? l : l.name)
            .filter(l => !l.startsWith('status:'));

        const newLabels = [...otherLabels, `status:${status}`];

        return this.updateIssue(issueNumber, {
            state: 'open',
            labels: newLabels
        });
    }

    async updateMilestone(issueNumber, milestoneNumber) {
        return this.updateIssue(issueNumber, {
            milestone: milestoneNumber
        });
    }

    async fetchMilestones() {
        return this.request(`/repos/${this.repo}/milestones`);
    }

    async fetchRepoLabels() {
        return this.request(`/repos/${this.repo}/labels`);
    }

    async fetchRepoAssignees() {
        return this.request(`/repos/${this.repo}/assignees`);
    }
}

const githubApi = new GitHubAPI();
window.githubApi = githubApi;
