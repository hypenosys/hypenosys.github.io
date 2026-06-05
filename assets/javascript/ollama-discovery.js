/**
 * Ollama Discovery and Model Management Module
 */

class OllamaDiscovery {
    constructor() {
        this.concurrencyLimit = 8;
        this.timeout = 1000; // ms
        this.isScanning = false;
    }

    /**
     * Scans for Ollama instances in a given range or list of IPs.
     * @param {string} input Hostname, IP, comma-separated list, or /24 range.
     * @param {function} onProgress Callback for progress updates.
     * @returns {Promise<string[]>} List of discovered Ollama endpoints.
     */
    async scan(input, onProgress) {
        if (this.isScanning) return [];
        this.isScanning = true;

        try {
            const targets = this.parseInput(input);
            const discovered = [];
            let completed = 0;

            const chunks = this.chunkArray(targets, this.concurrencyLimit);

            for (const chunk of chunks) {
                const results = await Promise.all(chunk.map(async (ip) => {
                    const endpoint = this.formatEndpoint(ip);
                    const isValid = await this.checkOllama(endpoint);
                    completed++;
                    if (onProgress) onProgress(completed, targets.length, ip, isValid);
                    return isValid ? endpoint : null;
                }));

                results.filter(r => r !== null).forEach(r => discovered.push(r));
            }

            return discovered;
        } finally {
            this.isScanning = false;
        }
    }

    parseInput(input) {
        const trimmed = input.trim();
        if (!trimmed) return ['localhost'];

        // CIDR /24 range
        if (trimmed.includes('/24')) {
            const base = trimmed.split('/24')[0].split('.').slice(0, 3).join('.');
            const hosts = [];
            for (let i = 1; i < 255; i++) {
                hosts.push(`${base}.${i}`);
            }
            return hosts;
        }

        // Comma separated list
        if (trimmed.includes(',')) {
            return trimmed.split(',').map(s => s.trim()).filter(Boolean);
        }

        return [trimmed];
    }

    formatEndpoint(host) {
        let endpoint = host;
        if (!endpoint.startsWith('http')) {
            endpoint = `http://${endpoint}`;
        }
        if (!endpoint.includes(':', 6)) { // check if port is missing (skipping http:// part)
            endpoint = `${endpoint}:11434`;
        }
        return endpoint;
    }

    async checkOllama(endpoint) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${endpoint}/api/tags`, {
                signal: controller.signal,
                mode: 'cors'
            });
            clearTimeout(timeoutId);
            if (!response.ok) return false;
            const data = await response.json();
            return !!data.models;
        } catch (e) {
            clearTimeout(timeoutId);
            return false;
        }
    }

    async fetchModels(endpoint) {
        try {
            const response = await fetch(`${endpoint}/api/tags`);
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const data = await response.json();
            return data.models || [];
        } catch (e) {
            console.error('[Ollama] Failed to fetch models:', e);
            throw e;
        }
    }

    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Map common network errors to user-friendly messages.
     */
    getErrorMessage(error, endpoint) {
        const msg = error.message.toLowerCase();
        if (msg.includes('failed to fetch') || msg.includes('networkerror')) {
            if (window.location.protocol === 'https:' && endpoint.startsWith('http:')) {
                return "Error de Contenido Mixto (HTTPS vs HTTP). El navegador bloquea peticiones HTTP desde HTTPS. Prueba usar una IP con HTTPS o desactiva la protección de red privada en el navegador.";
            }
            return "Error de red. Asegúrate de que Ollama está corriendo, el puerto es correcto y no hay bloqueos de firewall o Tailscale.";
        }
        if (msg.includes('abort')) return "Tiempo de espera agotado (Timeout).";
        return error.message;
    }
}

window.ollamaDiscovery = new OllamaDiscovery();
