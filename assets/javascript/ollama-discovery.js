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
        let endpoint = host.trim();
        if (!endpoint.startsWith('http')) {
            endpoint = `http://${endpoint}`;
        }
        if (!endpoint.includes(':', 6)) { // check if port is missing (skipping http:// part)
            endpoint = `${endpoint}:11434`;
        }
        // Remove trailing slash or /v1 if present
        endpoint = endpoint.replace(/\/+$/, '').replace(/\/v1$/, '');
        return endpoint;
    }

    async checkOllama(endpoint) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        try {
            const response = await fetch(`${endpoint}/api/tags`, {
                signal: controller.signal,
                mode: 'cors',
                credentials: 'omit'
            });
            clearTimeout(timeoutId);
            if (!response.ok) return false;
            const data = await response.json();
            return !!data.models;
        } catch (e) {
            clearTimeout(timeoutId);

            // Check for Mixed Content explicitly during scan
            if (window.location.protocol === 'https:' && endpoint.startsWith('http:')) {
                console.warn('[Ollama] Mixed Content detected during scan for:', endpoint);
            }

            return false;
        }
    }

    async fetchModels(endpoint) {
        // Sanitize endpoint just in case it wasn't already
        const cleanEndpoint = endpoint.replace(/\/+$/, '').replace(/\/v1$/, '');
        try {
            const response = await fetch(`${cleanEndpoint}/api/tags`, {
                mode: 'cors',
                credentials: 'omit'
            });
            if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
            const data = await response.json();
            return data.models || [];
        } catch (e) {
            console.error('[Ollama] Failed to fetch models:', e);
            // Architectural Note: Future proxy relay would be implemented here
            // to bypass Mixed Content restrictions from the server side.
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
        const msg = (error.message || "").toLowerCase();

        // Mixed Content Detection
        if (window.location.protocol === 'https:' && endpoint.startsWith('http:')) {
            return `BLOQUEO DE SEGURIDAD (Mixed Content): El navegador impide conectar a Ollama (HTTP) desde este sitio (HTTPS).

            SOLUCIÓN PARA VPN/LOCAL:
            1. Abre Chrome/Brave en: chrome://flags/#unsafely-treat-insecure-origin-as-secure
            2. Añade "${endpoint}" a la lista.
            3. Cambia a "Enabled" y reinicia el navegador.

            O usa una extensión como 'Allow CORS: Access-Control-Allow-Origin'.`;
        }

        if (msg.includes('failed to fetch') || msg.includes('networkerror') || error instanceof TypeError) {
            return "Error de red. Asegúrate de que Ollama está corriendo en " + endpoint + ", el puerto 11434 está abierto y no hay bloqueos de Firewall/VPN.";
        }
        if (msg.includes('abort')) return "Tiempo de espera agotado (Timeout).";
        return error.message || "Error de conexión desconocido.";
    }
}

window.ollamaDiscovery = new OllamaDiscovery();
