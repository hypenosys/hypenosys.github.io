/**
 * Jules API Client for Hypenosys Hub
 */

class JulesAPI {
    constructor() {
        this.baseUrl = 'https://jules.googleapis.com/v1alpha';
    }

    get apiKey() {
        return localStorage.getItem('jules_api_key');
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
            ...options.headers
        };

        try {
            const response = await fetch(url, { ...options, headers });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `API Error: ${response.status}`);
            }

            if (response.status === 204) return null;
            return await response.json();
        } catch (error) {
            console.error(`Jules API Error [${endpoint}]:`, error);
            throw error;
        }
    }

    // Sources
    async getSources() {
        return await this.request('/sources');
    }

    // Sessions
    async getSessions() {
        return await this.request('/sessions');
    }

    async createSession(data) {
        return await this.request('/sessions', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    async getSession(sessionId) {
        return await this.request(`/sessions/${sessionId}`);
    }

    async deleteSession(sessionId) {
        return await this.request(`/sessions/${sessionId}`, {
            method: 'DELETE'
        });
    }

    async approvePlan(sessionId) {
        return await this.request(`/sessions/${sessionId}:approvePlan`, {
            method: 'POST'
        });
    }

    async sendMessage(sessionId, message) {
        return await this.request(`/sessions/${sessionId}:sendMessage`, {
            method: 'POST',
            body: JSON.stringify({ message })
        });
    }

    async getActivities(sessionId) {
        return await this.request(`/sessions/${sessionId}/activities`);
    }
}

window.julesApi = new JulesAPI();
