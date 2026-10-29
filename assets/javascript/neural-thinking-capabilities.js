/**
 * Neural Thinking Capabilities Registry
 * Core capability detection, provider/family configuration, and rule resolution for Extended Thinking.
 */

window.NeuralThinkingCapabilities = (function() {

    function normalizeModelId(id) {
        return String(id || '').trim().toLowerCase().replace(/\./g, '-');
    }

    // ─── TIER 2: TABLA ESTÁTICA EXACTA POR ID DE MODELO NORMALIZADO (SIN REGEX) ───
    const STATIC_MODEL_TABLE = {
        anthropic: {
            "claude-3-7-sonnet-20250219": { family: "manual", canDisable: true, defaultOn: false, hasVisibleThinkingText: true },
            "claude-3-7-sonnet-latest":   { family: "manual", canDisable: true, defaultOn: false, hasVisibleThinkingText: true },
            "claude-opus-4-5":            { family: "manual", canDisable: true, defaultOn: false, hasVisibleThinkingText: true }, /* sin contrastar con la Models API */
            "claude-sonnet-4-5":          { family: "manual", canDisable: true, defaultOn: false, hasVisibleThinkingText: true }, /* sin contrastar con la Models API */
            "claude-haiku-4-5":           { family: "manual", canDisable: true, defaultOn: false, hasVisibleThinkingText: true }, /* sin contrastar con la Models API */
            "claude-opus-4-6":            { family: "adaptive", canDisable: true, defaultOn: false, hasVisibleThinkingText: true, offPayloadMode: "omit" }, /* sin contrastar con la Models API */
            "claude-sonnet-4-6":          { family: "adaptive", canDisable: true, defaultOn: false, hasVisibleThinkingText: true, offPayloadMode: "omit" }, /* sin contrastar con la Models API */
            "claude-opus-4-7":            { family: "adaptive", canDisable: true, defaultOn: false, hasVisibleThinkingText: true, offPayloadMode: "omit" }, /* sin contrastar con la Models API */
            "claude-opus-4-8":            { family: "adaptive", canDisable: true, defaultOn: false, hasVisibleThinkingText: true, offPayloadMode: "omit" }, /* sin contrastar con la Models API */
            "claude-opus-5-5":            { family: "adaptive", canDisable: true, defaultOn: true,  hasVisibleThinkingText: true, offPayloadMode: "disabled" }, /* sin contrastar con la Models API */
            "claude-sonnet-5-5":          { family: "adaptive", canDisable: true, defaultOn: true,  hasVisibleThinkingText: true, offPayloadMode: "disabled" }, /* sin contrastar con la Models API */
            "claude-haiku-5-5":           { family: "adaptive", canDisable: true, defaultOn: true,  hasVisibleThinkingText: true, offPayloadMode: "disabled" }, /* sin contrastar con la Models API */
            "claude-fable-5-1":           { family: "adaptive", canDisable: false, defaultOn: true,  hasVisibleThinkingText: true, offPayloadMode: "none" }, /* sin contrastar con la Models API */
            "claude-mythos-5-1":          { family: "adaptive", canDisable: false, defaultOn: true,  hasVisibleThinkingText: true, offPayloadMode: "none" } /* sin contrastar con la Models API */
        },
        openai: {
            "o1":        { canDisable: false, defaultOn: true, hasVisibleThinkingText: false },
            "o1-mini":   { canDisable: false, defaultOn: true, hasVisibleThinkingText: false },
            "o1-preview":{ canDisable: false, defaultOn: true, hasVisibleThinkingText: false },
            "o3-mini":   { canDisable: false, defaultOn: true, hasVisibleThinkingText: false }
        },
        gemini: {
            "gemini-2.5-flash":             { canDisable: true,  defaultOn: false, hasVisibleThinkingText: true, offPayload: { reasoning_effort: "none" } },
            "gemini-2.5-pro":               { canDisable: false, defaultOn: true,  hasVisibleThinkingText: true, offPayload: null },
            "gemini-2.0-flash-thinking-exp":{ canDisable: false, defaultOn: true,  hasVisibleThinkingText: true, offPayload: null },
            "gemini-3-flash":               { canDisable: false, defaultOn: true,  hasVisibleThinkingText: true, offPayload: null },
            "gemini-3-pro":                 { canDisable: false, defaultOn: true,  hasVisibleThinkingText: true, offPayload: null }
        },
        mistral: {
            "mistral-small-latest": { canDisable: true, defaultOn: false, hasVisibleThinkingText: true, offPayload: { reasoning_effort: "none" } },
            "mistral-medium-3-5":   { canDisable: true, defaultOn: false, hasVisibleThinkingText: true, offPayload: { reasoning_effort: "none" } },
            "mistral-large-4-0":    { canDisable: true, defaultOn: false, hasVisibleThinkingText: true, offPayload: { reasoning_effort: "none" } }
        },
        nvidia_nim: {
            "nvidia/nemotron-3-super-120b-a12b": { canDisable: true, defaultOn: true, hasVisibleThinkingText: true, offPayload: { chat_template_kwargs: { enable_thinking: false } } }
        },
        openrouter: {
            "google/gemini-4-argon": { canDisable: false, defaultOn: true, hasVisibleThinkingText: true, offPayload: null }
        }
    };

    // ─── MECA-CACHE DE ERRORES HTTP 400 (TTL 7 DÍAS) ───
    const UNSUPPORTED_CACHE_KEY = 'hy_thinking_unsupported_cache_v1';
    const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

    function getUnsupportedCache() {
        try {
            return JSON.parse(localStorage.getItem(UNSUPPORTED_CACHE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function markModelUnsupported(provider, model, errorMsg) {
        if (!errorMsg || !/thinking|reasoning|budget_tokens|thinking_config/i.test(errorMsg)) {
            return; // Solo cachear si el 400 menciona explícitamente parámetros de thinking
        }
        const cache = getUnsupportedCache();
        const normModel = normalizeModelId(model);
        const key = `${provider}:${normModel}`;
        cache[key] = { timestamp: Date.now(), reason: errorMsg.substring(0, 150) };
        try {
            localStorage.setItem(UNSUPPORTED_CACHE_KEY, JSON.stringify(cache));
        } catch (e) {}
    }

    function isModelCachedUnsupported(provider, model) {
        const cache = getUnsupportedCache();
        const normModel = normalizeModelId(model);
        const key = `${provider}:${normModel}`;
        const entry = cache[key];
        if (!entry) return false;
        if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
            delete cache[key];
            try { localStorage.setItem(UNSUPPORTED_CACHE_KEY, JSON.stringify(cache)); } catch(e){}
            return false;
        }
        return true;
    }

    // ─── TIER 1 & DIVERSIFICACIÓN DE DERECHOS DE CAPACIDAD ───

    async function detectDynamicCapability(provider, model, dynamicMeta = null) {
        const normModel = normalizeModelId(model);
        if (isModelCachedUnsupported(provider, normModel)) {
            return { supportsThinking: false, reason: "Cached 400 error" };
        }

        if (provider === 'openrouter' && dynamicMeta && dynamicMeta.supported_parameters) {
            const hasReasoning = Array.isArray(dynamicMeta.supported_parameters) && dynamicMeta.supported_parameters.includes('reasoning');
            return {
                supportsThinking: hasReasoning,
                source: 'dynamic_openrouter',
                canDisable: true,
                hasVisibleThinkingText: true
            };
        }

        if (provider === 'ollama' && dynamicMeta) {
            let capabilities = dynamicMeta.capabilities || [];
            if (!Array.isArray(capabilities) && dynamicMeta.details) {
                capabilities = dynamicMeta.details.capabilities || [];
            }
            const hasThinking = Array.isArray(capabilities) && capabilities.includes('thinking');
            return {
                supportsThinking: hasThinking,
                source: 'dynamic_ollama',
                canDisable: true,
                hasVisibleThinkingText: true,
                offPayload: { think: false }
            };
        }

        if (provider === 'anthropic' && dynamicMeta && dynamicMeta.capabilities && dynamicMeta.capabilities.thinking) {
            const thinkingMeta = dynamicMeta.capabilities.thinking;
            const types = thinkingMeta.types || [];
            const canDisable = thinkingMeta.disabled ? !!thinkingMeta.disabled.supported : true;
            return {
                supportsThinking: types.length > 0,
                source: 'dynamic_anthropic',
                family: types.includes('adaptive') ? 'adaptive' : 'manual',
                canDisable: canDisable,
                hasVisibleThinkingText: true
            };
        }

        return null;
    }

    function resolveCapability(provider, model, options = {}) {
        const { userOverride, dynamicMeta } = options;
        const normModel = normalizeModelId(model);

        const mapKey = `${provider}:${normModel}`;

        // Tier 3: Manual User Override per provider:model
        let overrideMap = {};
        try {
            overrideMap = JSON.parse(localStorage.getItem('hy_thinking_override_map') || '{}');
        } catch (e) {}

        const entry = overrideMap[mapKey] || (userOverride !== undefined && userOverride !== null ? { enabled: !!userOverride } : null);

        if (entry) {
            return {
                supportsThinking: !!entry.enabled,
                canDisable: true,
                defaultOn: false,
                hasVisibleThinkingText: true,
                overrideFormat: entry.format || null,
                source: 'user_override'
            };
        }

        // Tier 1: Dynamic API Check (TIER 1 takes precedence when dynamicMeta is present)
        if (dynamicMeta) {
            if (provider === 'openrouter' && dynamicMeta.supported_parameters) {
                const hasReasoning = Array.isArray(dynamicMeta.supported_parameters) && dynamicMeta.supported_parameters.includes('reasoning');
                return {
                    supportsThinking: hasReasoning,
                    canDisable: true,
                    defaultOn: false,
                    hasVisibleThinkingText: true,
                    source: 'dynamic_openrouter'
                };
            }
            if (provider === 'ollama' && dynamicMeta) {
                let capabilities = dynamicMeta.capabilities || [];
                if (!Array.isArray(capabilities) && dynamicMeta.details) {
                    capabilities = dynamicMeta.details.capabilities || [];
                }
                const hasThinking = Array.isArray(capabilities) && capabilities.includes('thinking');
                return {
                    supportsThinking: hasThinking,
                    canDisable: true,
                    defaultOn: false,
                    hasVisibleThinkingText: true,
                    offPayload: { think: false },
                    source: 'dynamic_ollama'
                };
            }
            if (provider === 'anthropic' && dynamicMeta.capabilities && dynamicMeta.capabilities.thinking) {
                const thinkingMeta = dynamicMeta.capabilities.thinking;
                const types = thinkingMeta.types || [];
                const canDisable = thinkingMeta.disabled ? !!thinkingMeta.disabled.supported : true;
                return {
                    supportsThinking: types.length > 0,
                    canDisable: canDisable,
                    defaultOn: false,
                    hasVisibleThinkingText: true,
                    family: types.includes('adaptive') ? 'adaptive' : 'manual',
                    offPayloadMode: canDisable ? 'omit' : 'none',
                    source: 'dynamic_anthropic'
                };
            }
        }

        // Check Cached 400 Unsupported
        if (isModelCachedUnsupported(provider, normModel)) {
            return {
                supportsThinking: false,
                canDisable: false,
                defaultOn: false,
                hasVisibleThinkingText: false,
                source: 'cached_400_unsupported'
            };
        }

        // Tier 2: Static Exact Model Table Match (using normalized Model ID)
        const providerTable = STATIC_MODEL_TABLE[provider];
        if (providerTable && (providerTable[normModel] || providerTable[model])) {
            const config = providerTable[normModel] || providerTable[model];
            return {
                supportsThinking: true,
                canDisable: config.canDisable,
                defaultOn: !!config.defaultOn,
                hasVisibleThinkingText: config.hasVisibleThinkingText,
                offPayload: config.offPayload !== undefined ? config.offPayload : null,
                offPayloadMode: config.offPayloadMode || null,
                family: config.family || null,
                source: 'static_table'
            };
        }

        // Default Fallback for Unknown Models per Provider
        if (provider === 'anthropic') {
            // Unknown Anthropic model: set canDisable = false and offPayloadMode = 'omit' (do NOT send { type: 'disabled' } blindly)
            return {
                supportsThinking: true,
                canDisable: false,
                defaultOn: false,
                hasVisibleThinkingText: true,
                family: 'adaptive',
                offPayloadMode: 'omit',
                unknownModelWarning: true,
                source: 'unknown_anthropic_fallback'
            };
        }

        return {
            supportsThinking: false,
            canDisable: false,
            defaultOn: false,
            hasVisibleThinkingText: false,
            source: 'unknown_unsupported'
        };
    }

    return {
        STATIC_MODEL_TABLE,
        normalizeModelId,
        resolveCapability,
        detectDynamicCapability,
        markModelUnsupported,
        isModelCachedUnsupported
    };

})();
