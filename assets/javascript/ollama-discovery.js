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
            if (targets.length === 0) return [];

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

        // Comma separated list
        if (trimmed.includes(',')) {
            return trimmed.split(',')
                .map(s => s.trim())
                .filter(s => this.isValidHost(s));
        }

        // CIDR /24 range
        if (trimmed.includes('/')) {
            const [ip, mask] = trimmed.split('/');
            if (mask !== '24') {
                alert('Solo se permiten rangos /24 para evitar saturación de red.');
                return [];
            }
            if (!this.isValidIP(ip)) {
                alert('IP base inválida para el rango.');
                return [];
            }
            if (!this.isPrivateIP(ip)) {
                if (!confirm('La IP indicada no parece privada. ¿Deseas escanear una red pública? Esto podría ser bloqueado por el navegador.')) {
                    return [];
                }
            }
            const base = ip.split('.').slice(0, 3).join('.');
            const hosts = [];
            for (let i = 1; i < 255; i++) {
                hosts.push(`${base}.${i}`);
            }
            return hosts;
        }

        if (this.isValidHost(trimmed)) {
            return [trimmed];
        }

        alert('Formato de host o IP inválido.');
        return [];
    }

    isValidHost(host) {
        if (host === 'localhost') return true;
        return this.isValidIP(host) || this.isValidHostname(host);
    }

    isValidIP(ip) {
        const parts = ip.split('.');
        if (parts.length !== 4) return false;
        return parts.every(p => {
            const n = parseInt(p, 10);
            return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
        });
    }

    isValidHostname(hostname) {
        const re = /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.[A-Za-z0-9-]{1,63})*$/;
        return re.test(hostname);
    }

    isPrivateIP(ip) {
        const parts = ip.split('.').map(p => parseInt(p, 10));
        if (parts[0] === 10) return true;
        if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
        if (parts[0] === 192 && parts[1] === 168) return true;
        if (parts[0] === 127) return true;
        if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true; // Tailscale / CGNAT
        return false;
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
