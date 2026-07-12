/* ════════════════════════════════════════
   NEURAL CHAT PROFILES & CONFIG
   ════════════════════════════════════════ */

window.loadProfiles = async function() {
    let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');

    // Auto-detect NVIDIA NIM (Formalized as nvidia_nim)
    const currentConfig = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
    if (currentConfig.base_url?.includes('integrate.api.nvidia.com') || currentConfig.provider === 'nvidia_nim') {
        const nimId = 'nvidia-nim-default';
        if (!profiles[nimId]) {
            profiles[nimId] = {
                ...currentConfig,
                id: nimId,
                name: 'NVIDIA NIM',
                provider: 'nvidia_nim',
                modelType: currentConfig.modelType || 'chat'
            };
        }
    }

    // Auto-detect Ollama
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('http://localhost:11434/api/tags', { signal: controller.signal }).catch(() => null);
        clearTimeout(timeout);
        if (res && res.ok) {
            const data = await res.json();
            profiles['ollama-local'] = {
                id: 'ollama-local',
                name: 'Ollama (Local)',
                provider: 'ollama',
                base_url: 'http://localhost:11434/v1',
                api_key: 'ollama',
                models: data.models.map(m => m.name),
                model: data.models[0]?.name || 'llama3'
            };
        }
    } catch (e) {}

    localStorage.setItem('ai_profiles', JSON.stringify(profiles));
    renderProfileDropdown();
}

window.renderProfileDropdown = function() {
    const list = document.getElementById('profile-list');
    if (!list) return;

    const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
    const activeId = localStorage.getItem('activeProfile');

    list.innerHTML = Object.values(profiles).map(p => {
        const isNvidia = p.provider === 'nvidia_nim' || p.id === 'nvidia-nim' || p.id === 'nvidia-nim-default';
        const isOllama = p.id === 'ollama-local' || p.provider === 'ollama';
        const icon = isOllama ? '🟢' : (isNvidia ? '⚡' : '👤');
        const displayName = p.name || p.id;
        const providerName = p.provider === 'ollama' ? 'Ollama Local' :
                            (p.provider === 'anthropic' ? 'Anthropic' :
                            (p.provider === 'openai' ? 'OpenAI' :
                            (p.provider === 'nvidia_nim' ? 'NVIDIA NIM' : p.provider)));

        let secondaryInfo = `${providerName} · ${p.model || 'Desconocido'}`;
        if (p.base_url && p.provider === 'custom') {
            secondaryInfo += `<br><span style="opacity:0.5; font-size:8px;">${p.base_url}</span>`;
        }

        let modelsHtml = '';
        if (p.models && p.models.length > 0) {
            modelsHtml = `
                <div class="profile-models-list">
                    ${p.models.slice(0, 10).map(m => `
                        <div onclick="selectModelFromProfile('${p.id}', '${m}')" class="profile-model-item" title="${m}">
                            ${m}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        const activeClass = p.id === activeId ? 'active' : '';

        return `
            <div class="profile-dropdown-item">
                <div onclick="selectProfile('${p.id}')" class="profile-item-main group">
                    <div class="profile-item-info">
                        <span class="profile-icon">${icon}</span>
                        <div>
                            <div class="profile-name ${activeClass}">${displayName}</div>
                            <div style="font-size: 8px; color: var(--text3); line-height: 1.2;">${secondaryInfo}</div>
                        </div>
                    </div>
                    <button onclick="event.stopPropagation(); deleteProfile('${p.id}')" class="profile-delete-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                ${modelsHtml}
            </div>
        `;
    }).join('');
}

window.selectProfile = function(id) {
    localStorage.setItem('activeProfile', id);
    const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
    const config = profiles[id];
    localStorage.setItem('hy_ai_config', JSON.stringify(config));

    // Sync modal fields if it exists
    const nameInput = document.getElementById('ai_profile_name');
    const providerInput = document.getElementById('ai_provider');
    const modelInput = document.getElementById('ai_model');
    const keyInput = document.getElementById('ai_api_key');
    const urlInput = document.getElementById('ai_base_url');
    const localNetInput = document.getElementById('ai_local_network');

    if (nameInput) nameInput.value = config.name || '';
    if (providerInput) {
        providerInput.value = config.provider || 'none';
        // Trigger UI updates for the provider
        if (window.ollamaUI && typeof window.ollamaUI.handleProviderChange === 'function') {
            window.ollamaUI.handleProviderChange();
        }
    }
    if (modelInput) modelInput.value = config.model || '';
    const embeddingInput = document.getElementById('ai_embedding_model');
    if (embeddingInput) embeddingInput.value = config.embedding_model || '';
    if (keyInput) keyInput.value = config.api_key || '';
    if (urlInput) urlInput.value = config.base_url || '';
    if (localNetInput) localNetInput.checked = !!(config.local_network || config.localNetwork);

    updateActiveProfileUI(config);
    adaptUI(config);
    checkConnection(config.provider, config);

    const dropdown = document.getElementById('profile-dropdown');
    if (dropdown) dropdown.classList.add('hidden');

    // If we are in the modal, we might want to refresh the manager list to show active state
    renderProfileManagerList();
}

window.selectModelFromProfile = function(profileId, model) {
    localStorage.setItem('activeProfile', profileId);
    const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
    const config = { ...profiles[profileId], model: model };

    // Detect model type from name
    config.modelType = detectModelType(model);

    localStorage.setItem('hy_ai_config', JSON.stringify(config));
    updateActiveProfileUI(config);
    adaptUI(config);
    checkConnection(config.provider, config);
    document.getElementById('profile-dropdown').classList.add('hidden');
}

window.deleteProfile = function(id) {
    if (!confirm('¿Seguro que quieres eliminar este perfil?')) return;
    let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
    delete profiles[id];
    localStorage.setItem('ai_profiles', JSON.stringify(profiles));
    if (localStorage.getItem('activeProfile') === id) {
        localStorage.removeItem('activeProfile');
        // Clear active config too
        localStorage.removeItem('hy_ai_config');
    }

    renderProfileDropdown();
    renderProfileManagerList();

    // If we were on this profile, update UI
    const currentConfig = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
    updateActiveProfileUI(currentConfig);
}

window.detectModelType = function(modelId) {
    const m = modelId.toLowerCase();
    if (/vl|vision|visual|llava|pixtral|intern-vl/.test(m)) return 'vision';
    if (/embed|e5-|nv-embed|retrieval/.test(m)) return 'embedding';
    if (/rerank/.test(m)) return 'reranking';
    if (/asr|tts|whisper|canary|parakeet|fastpitch/.test(m)) return 'audio';
    if (/stable-diffusion|flux|sdxl|imagen|dall/.test(m)) return 'image-gen';
    if (/cosmos|video|wan/.test(m)) return 'video';
    if (/code|starcoder|deepseek-coder|qwen-coder/.test(m)) return 'code';
    if (/thinking|r1|o1|qwq/.test(m)) return 'reasoning';
    if (/guard|shield|llama-guard|nemo-guard/.test(m)) return 'safety';
    return 'chat';
}

window.updateActiveProfileUI = function(config) {
    const nameEl = document.getElementById('active-profile-name');
    const mobNameEl = document.getElementById('mob-active-profile-name');

    let text = 'CONFIG IA';
    if (config && config.provider && config.provider !== 'none') {
        // Priority: Custom Name > Model Name > Provider
        if (config.name) {
            text = config.name;
        } else if (config.model) {
            text = config.model.split('/').pop().toUpperCase();
        } else {
            text = config.provider.toUpperCase();
        }
    }

    if (nameEl) {
        nameEl.textContent = text === 'CONFIG IA' ? 'ANTHROPIC' : text; // Desktop fallback to Anthropic label if empty for legacy
    }

    if (mobNameEl) {
        // For mobile, maybe even more compact
        let mobText = text;
        if (mobText.length > 15) mobText = mobText.substring(0, 12) + '...';
        mobNameEl.textContent = mobText;
    }
}

window.adaptUI = function(config) {
    const type = config.modelType || 'chat';

    // Reset UI - check if elements exist (Neural Chat only)
    const imgRes = document.getElementById('image-resolution');
    const audioRec = document.getElementById('audio-record-container');
    const attachBtn = document.getElementById('attach-btn');
    const toggleInput = document.getElementById('toggle-input-mode');

    if (imgRes) imgRes.classList.add('hidden');
    if (audioRec) audioRec.classList.add('hidden');
    if (window.chatInput) window.chatInput.classList.remove('hidden');
    if (attachBtn) attachBtn.classList.add('hidden');
    if (toggleInput) toggleInput.classList.add('hidden');

    if (type === 'image-gen' && imgRes) {
        imgRes.classList.remove('hidden');
    } else if (type === 'audio') {
        if (!config.useTextInAudioMode) {
            if (audioRec) audioRec.classList.remove('hidden');
            if (window.chatInput) window.chatInput.classList.add('hidden');
            if (toggleInput) toggleInput.classList.remove('hidden');
        } else if (toggleInput) {
            toggleInput.classList.remove('hidden');
            toggleInput.innerHTML = '<i class="fas fa-microphone text-xs"></i>';
        }
    } else if (type === 'vision' && attachBtn) {
        attachBtn.classList.remove('hidden');
    }
}

window.setupProfileSelector = function() {
    const btn = document.getElementById('active-profile-btn');
    const dropdown = document.getElementById('profile-dropdown');
    const overlay = document.getElementById('sidebar-overlay');

    if (!btn || !dropdown) return;

    btn.onclick = (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768 && overlay) {
            dropdown.classList.add('open');
            overlay.classList.add('active');
        } else {
            dropdown.classList.toggle('hidden');
        }
    };

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            if (dropdown.classList.contains('open')) {
                dropdown.classList.remove('open');
            }
            dropdown.classList.add('hidden');
            if (window.innerWidth <= 768 && overlay) overlay.classList.remove('active');
        }
    });
}

window.getActiveConfig = function() {
    const activeProfileId = localStorage.getItem('activeProfile');
    const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');

    if (activeProfileId && profiles[activeProfileId]) {
        return profiles[activeProfileId];
    }

    return JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
}

window.checkConnection = async function(provider, config) {
    const statusBadge = document.getElementById('connection-status');
    const sidebarWarning = document.getElementById('sidebar-ollama-warning');

    if (!statusBadge) return;

    try {
        if (provider === 'ollama') {
            let baseUrl = config.base_url || '';
            if (baseUrl && !baseUrl.startsWith('http')) {
                baseUrl = 'http://' + baseUrl;
            }
            // Remove trailing slash but keep /v1 if present in config
            baseUrl = baseUrl.trim().replace(/\/+$/, '');
            // Use native health check endpoint
            const healthEndpoint = baseUrl.replace(/\/v1$/, '');
            const response = await fetch(`${healthEndpoint}/api/tags`, {
                mode: 'cors',
                credentials: 'omit'
            }).catch(() => null);
            if (response && response.ok) {
                statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#50fa7b] bg-[#50fa7b]/5 px-3 py-1 rounded-full border border-[#50fa7b]/20";
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#50fa7b] shadow-[0_0_8px_#50fa7b] animate-pulse"></span> OLLAMA: ONLINE';
                if (sidebarWarning) sidebarWarning.classList.add('hidden');
            } else {
                throw new Error();
            }
        } else if (provider === 'nvidia_nim') {
            const key = config.api_key || '';
            if (key.startsWith('nvapi-')) {
                statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#ffb86c] bg-[#ffb86c]/5 px-3 py-1 rounded-full border border-[#ffb86c]/20";
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ffb86c] shadow-[0_0_8px_#ffb86c] animate-pulse"></span> NVIDIA NIM: READY';
            } else if (key) {
                 statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#8be9fd] bg-[#8be9fd]/5 px-3 py-1 rounded-full border border-[#8be9fd]/20";
                 statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#8be9fd] shadow-[0_0_8px_#8be9fd] animate-pulse"></span> NIM COMPATIBLE: READY';
            } else {
                statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#ff5555] bg-[#ff5555]/5 px-3 py-1 rounded-full border border-[#ff5555]/20";
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ff5555] shadow-[0_0_8px_#ff5555]"></span> CONFIG REQUIRED';
            }
        } else {
            const key = config.api_key || '';
            const isAnthropic = provider === 'anthropic' && key.startsWith('sk-ant-');
            const isOpenAI = provider === 'openai' && key.startsWith('sk-');

            if (isAnthropic || isOpenAI || key) {
                const label = provider.toUpperCase();
                statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#8be9fd] bg-[#8be9fd]/5 px-3 py-1 rounded-full border border-[#8be9fd]/20";
                statusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#8be9fd] shadow-[0_0_8px_#8be9fd] animate-pulse"></span> ${label}: READY`;
            } else {
                statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#ff5555] bg-[#ff5555]/5 px-3 py-1 rounded-full border border-[#ff5555]/20";
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ff5555] shadow-[0_0_8px_#ff5555]"></span> CONFIG REQUIRED';
            }
        }
    } catch (e) {
        statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#ff5555] bg-[#ff5555]/5 px-3 py-1 rounded-full border border-[#ff5555]/20";
        statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#ff5555] shadow-[0_0_8px_#ff5555]"></span> OFFLINE';
        if (provider === 'ollama' && sidebarWarning) sidebarWarning.classList.remove('hidden');
    }
}

window.setupApiModalEnhancements = function() {
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const modal = mutation.target;
                if (modal.classList.contains('show')) {
                    injectProfileManager();
                }
            }
        });
    });

    const apiModal = document.getElementById('modalApiConfig');
    if (apiModal) {
        observer.observe(apiModal, { attributes: true });
    }
}

window.injectProfileManager = function() {
    const modalBody = document.querySelector('#modalApiConfig .modal-body');
    if (!modalBody) return;

    let managerContainer = document.getElementById('profile-manager-container');
    if (!managerContainer) {
        managerContainer = document.createElement('div');
        managerContainer.id = 'profile-manager-container';
        managerContainer.className = 'form-group mt-4 border-t border-purple pt-3';
        managerContainer.innerHTML = `
            <label class="text-gray-400 small font-weight-bold uppercase mb-2">PERFILES GUARDADOS</label>
            <div id="profile-manager-list" class="space-y-1"></div>
        `;
        modalBody.appendChild(managerContainer);
    }
    renderProfileManagerList();
}

window.renderProfileManagerList = function() {
    const listContainer = document.getElementById('profile-manager-list');
    if (!listContainer) return;

    const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
    const profileEntries = Object.entries(profiles);
    const activeId = localStorage.getItem('activeProfile');

    if (profileEntries.length === 0) {
        listContainer.innerHTML = '<div class="text-[10px] text-gray-500 italic">No hay perfiles guardados</div>';
        return;
    }

    listContainer.innerHTML = profileEntries.map(([id, p]) => {
        const name = p.name || id;
        const provider = p.provider === 'ollama' ? 'Ollama Local' :
                        (p.provider === 'anthropic' ? 'Anthropic' :
                        (p.provider === 'openai' ? 'OpenAI' : p.provider || 'custom'));
        const model = p.model || 'unknown';
        const endpoint = p.base_url || '';

        const isActive = id === activeId;
        const activeClass = isActive ? 'border-[#bd93f9] bg-[#bd93f9]/5' : 'border-purple/20 bg-dark/30';

        return `
            <div class="profile-item d-flex justify-content-between align-items-start mb-3 p-3 rounded border transition-all ${activeClass} hover:border-purple/50">
                <div class="flex-grow text-left truncate mr-2">
                    <div class="text-[13px] text-white font-bold truncate mb-1">
                        ${isActive ? '<i class="fas fa-check-circle text-[#bd93f9] mr-1"></i>' : ''}${name}
                    </div>
                    <div class="text-[11px] text-gray-400 truncate">
                        <span class="text-purple/80 uppercase font-bold">${provider}</span> · ${model}
                    </div>
                    ${endpoint ? `<div class="text-[10px] text-gray-500 truncate font-mono mt-1 opacity-70">${endpoint}</div>` : ''}

                    <div class="mt-2 d-flex gap-2">
                        <button class="btn btn-xs btn-purple px-3" onclick="window.selectProfile('${id}')" style="font-size: 9px; font-weight: 800; background: #7c3aed; color: #fff; border: none; border-radius: 4px;">
                            [CARGAR]
                        </button>
                        <button class="btn btn-xs btn-outline-danger px-3" onclick="window._deleteProfileFromModal('${id}', '${name}')" style="font-size: 9px; font-weight: 800; border-color: rgba(255,85,85,0.3); color: #ff5555; background: rgba(255,85,85,0.05); border-radius: 4px;">
                            [BORRAR]
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

window._deleteProfileFromModal = function(id, name) {
    if (confirm(`¿Eliminar perfil "${name}"?`)) {
        let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
        delete profiles[id];
        localStorage.setItem('ai_profiles', JSON.stringify(profiles));

        if (localStorage.getItem('activeProfile') === id) {
            localStorage.removeItem('activeProfile');
            localStorage.removeItem('hy_ai_config');
        }

        renderProfileManagerList();
        renderProfileDropdown();

        const currentConfig = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
        updateActiveProfileUI(currentConfig);

        if (typeof window.loadProfiles === 'function') window.loadProfiles();
    }
};

