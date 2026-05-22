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
        if (!this.apiKey) {
            throw new Error('API Key de Jules no configurada.');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
            ...options.headers
        };

        try {
            const response = await fetch(url, { ...options, headers });

            // Handle CORS specifically
            if (response.type === 'opaque') {
                throw new Error('CORS Error: La API de Jules no permite llamadas directas desde este origen.');
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error?.message || `Error de API: ${response.status}`);
            }

            if (response.status === 204) return null;
            return await response.json();
        } catch (error) {
            console.error(`Jules API Error [${endpoint}]:`, error);
            if (error.message.includes('Failed to fetch')) {
                throw new Error('⚠️ Error de red o CORS: La API de Jules no permite llamadas directas desde el navegador. Activa el proxy o revisa la configuración.');
            }
            throw error;
        }
    }

    // Sources with Caching
    async getSources() {
        const CACHE_KEY = 'jules_sources_cache';
        const TTL = 5 * 60 * 1000; // 5 minutes

        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < TTL) {
                return data;
            }
        }

        const data = await this.request('/sources');
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
        return data;
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
        // Correcting method: POST to :approvePlan
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
