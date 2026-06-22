/* ════════════════════════════════════════
   NEURAL CHAT PROFILES & CONFIG
   ════════════════════════════════════════ */

window.loadProfiles = async function() {
    let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');

    // Auto-detect NVIDIA NIM
    const currentConfig = JSON.parse(localStorage.getItem('hy_ai_config') || '{}');
    if (currentConfig.base_url?.includes('integrate.api.nvidia.com')) {
        profiles['nvidia-nim'] = {
            ...currentConfig,
            id: 'nvidia-nim',
            name: 'NVIDIA NIM',
            provider: 'custom',
            modelType: 'chat'
        };
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
    const profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
    const activeId = localStorage.getItem('activeProfile');

    list.innerHTML = Object.values(profiles).map(p => {
        const isNvidia = p.id === 'nvidia-nim';
        const isOllama = p.id === 'ollama-local';
        const icon = isOllama ? '🟢' : (isNvidia ? '⚡' : '👤');

        let modelsHtml = '';
        if (p.models && p.models.length > 0) {
            modelsHtml = `
                <div class="pl-6 space-y-1 mt-1">
                    ${p.models.slice(0, 10).map(m => `
                        <div onclick="selectModelFromProfile('${p.id}', '${m}')" class="text-[9px] text-[#6272a4] hover:text-white cursor-pointer truncate">
                            ${m}
                        </div>
                    `).join('')}
                </div>
            `;
        }

        return `
            <div class="px-3 py-2 border-b border-[#44475a]/30">
                <div onclick="selectProfile('${p.id}')" class="flex items-center justify-between cursor-pointer group">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px]">${icon}</span>
                        <span class="text-[10px] font-bold ${p.id === activeId ? 'text-[#bd93f9]' : 'text-slate-400'}">${p.name}</span>
                    </div>
                    <button onclick="event.stopPropagation(); deleteProfile('${p.id}')" class="opacity-0 group-hover:opacity-100 text-[#ff5555] text-[10px]">
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

    updateActiveProfileUI(config);
    adaptUI(config);
    checkConnection(config.provider, config);
    document.getElementById('profile-dropdown').classList.add('hidden');
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
    }
    renderProfileDropdown();
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
    const model = config.model || 'SONNET-3.5';
    nameEl.textContent = model.split('/').pop().toUpperCase();
}

window.adaptUI = function(config) {
    const type = config.modelType || 'chat';

    // Reset UI
    document.getElementById('image-resolution').classList.add('hidden');
    document.getElementById('audio-record-container').classList.add('hidden');
    window.chatInput.classList.remove('hidden');
    document.getElementById('attach-btn').classList.add('hidden');
    document.getElementById('toggle-input-mode').classList.add('hidden');

    if (type === 'image-gen') {
        document.getElementById('image-resolution').classList.remove('hidden');
    } else if (type === 'audio') {
        if (!config.useTextInAudioMode) {
            document.getElementById('audio-record-container').classList.remove('hidden');
            window.chatInput.classList.add('hidden');
            document.getElementById('toggle-input-mode').classList.remove('hidden');
        } else {
            document.getElementById('toggle-input-mode').classList.remove('hidden');
            document.getElementById('toggle-input-mode').innerHTML = '<i class="fas fa-microphone text-xs"></i>';
        }
    } else if (type === 'vision') {
        document.getElementById('attach-btn').classList.remove('hidden');
    }
}

window.setupProfileSelector = function() {
    const btn = document.getElementById('active-profile-btn');
    const dropdown = document.getElementById('profile-dropdown');
    const overlay = document.getElementById('sidebar-overlay');

    btn.onclick = (e) => {
        e.stopPropagation();
        if (window.innerWidth <= 768) {
            dropdown.classList.add('open');
            overlay.classList.add('active');
        } else {
            dropdown.classList.toggle('hidden');
        }
    };

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('open');
            dropdown.classList.add('hidden');
            if (window.innerWidth <= 768) overlay.classList.remove('active');
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
        } else {
            const key = config.api_key;
            if (key && key.startsWith('sk-')) {
                statusBadge.className = "flex items-center gap-2 text-[10px] font-black tracking-widest text-[#8be9fd] bg-[#8be9fd]/5 px-3 py-1 rounded-full border border-[#8be9fd]/20";
                statusBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-[#8be9fd] shadow-[0_0_8px_#8be9fd] animate-pulse"></span> ANTHROPIC: READY';
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
                    injectNIMOption();
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
            <label class="text-gray-400 small font-weight-bold uppercase mb-2">Perfiles Guardados</label>
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

    if (profileEntries.length === 0) {
        listContainer.innerHTML = '<div class="text-[10px] text-gray-500 italic">No hay perfiles guardados</div>';
        return;
    }

    listContainer.innerHTML = profileEntries.map(([id, p]) => {
        const name = p.name || id;
        return `
            <div class="profile-item d-flex justify-content-between align-items-center mb-1 bg-dark/30 p-2 rounded border border-purple/20 hover:border-purple/50 transition-all">
                <button class="btn-load-profile text-[11px] text-white hover:text-[#bd93f9] font-bold transition-all bg-transparent border-none p-0 flex-grow text-left truncate mr-2"
                        onclick="window.selectProfile('${id}')" title="Cargar perfil">
                    <i class="fas fa-id-card mr-2 opacity-50"></i>${name}
                </button>
                <button class="btn-delete-profile btn btn-sm"
                        onclick="window._deleteProfileFromModal('${id}', '${name}')"
                        style="color:#ff5555; background:rgba(255,85,85,0.1); border:1px solid rgba(255,85,85,0.2); padding:2px 8px; border-radius:4px;"
                        title="Eliminar perfil">
                    <i class="fas fa-trash-alt text-[10px]"></i>
                </button>
            </div>
        `;
    }).join('');
}

window._enhancedDiscoverModels = async function() {
    const provider = document.getElementById('ai_provider').value;
    const baseUrl = (document.getElementById('ai_base_url').value || '').trim();
    const apiKey = document.getElementById('ai_api_key').value;
    const modelInput = document.getElementById('ai_model');

    const discoverBtn = document.querySelector('#group-discover-models button');
    const originalText = discoverBtn.innerHTML;

    // Handle UI feedback area
    let feedbackEl = document.getElementById('discover-feedback');
    if (!feedbackEl) {
        feedbackEl = document.createElement('div');
        feedbackEl.id = 'discover-feedback';
        feedbackEl.className = 'text-[10px] mt-2 font-bold';
        modelInput.parentElement.after(feedbackEl);
    }
    feedbackEl.innerHTML = '';
    feedbackEl.className = 'text-[10px] mt-2 font-bold';

    if (provider === 'nvidia_nim') {
        // Task: NO fetch. Render grouped list.
        const select = document.createElement('select');
        select.className = 'form-control bg-dark text-white border-purple mt-2';
        select.innerHTML = '<option value="">-- Selecciona modelo NIM --</option>';

        const groups = [
            { label: '🤖 Chat', key: 'chat' },
            { label: '👁️ Visión & Multimodal', key: 'vision' },
            { label: '🎙️ Voz (ASR/TTS)', key: 'speech' },
            { label: '🔍 Embeddings', key: 'embeddings' }
        ];

        groups.forEach(g => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = g.label;
            NVIDIA_NIM_CATALOG[g.key].forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.label;
                optgroup.appendChild(opt);
            });
            select.appendChild(optgroup);
        });

        select.onchange = () => { if (select.value) modelInput.value = select.value; };
        feedbackEl.appendChild(select);
        return;
    }

    if (provider === 'ollama') {
        discoverBtn.disabled = true;
        discoverBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);

            // Use OpenAI-compatible /models endpoint if baseUrl is /v1
            const res = await fetch(`${baseUrl}/models`, {
                headers: { 'Authorization': 'Bearer ollama' },
                signal: controller.signal
            });
            clearTimeout(id);

            if (res.ok) {
                const data = await res.json();
                const models = data.data || [];
                if (models.length > 0) {
                    const select = document.createElement('select');
                    select.className = 'form-control bg-dark text-white border-purple mt-2';
                    select.innerHTML = models.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
                    select.onchange = () => { modelInput.value = select.value; };
                    feedbackEl.appendChild(select);
                } else {
                    throw new Error("No hay modelos instalados");
                }
            } else {
                throw new Error("Ollama offline");
            }
        } catch (e) {
            feedbackEl.className += ' text-orange-400';
            feedbackEl.innerHTML = '⚠️ Ollama no detectado — catálogo de referencia';

            const select = document.createElement('select');
            select.className = 'form-control bg-dark text-white border-purple mt-2';
            select.innerHTML = '<option value="">-- Catálogo Ollama --</option>' +
                OLLAMA_DEFAULT_CATALOG.map(m => `<option value="${m.id}">${m.label}</option>`).join('');
            select.onchange = () => { if (select.value) modelInput.value = select.value; };
            feedbackEl.appendChild(select);
        } finally {
            discoverBtn.disabled = false;
            discoverBtn.innerHTML = originalText;
        }
        return;
    }

    // Custom / Others
    discoverBtn.disabled = true;
    discoverBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await fetch(`${baseUrl}/models`, {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        const data = await res.json();
        const models = data.data || [];

        if (models.length > 0) {
            const select = document.createElement('select');
            select.className = 'form-control bg-dark text-white border-purple mt-2';
            select.innerHTML = models.map(m => `<option value="${m.id}">${m.id}</option>`).join('');
            select.onchange = () => { modelInput.value = select.value; };
            feedbackEl.appendChild(select);
        } else {
            throw new Error("No se encontraron modelos");
        }
    } catch (e) {
        feedbackEl.className += ' text-red-500';
        feedbackEl.innerText = `Error: ${e.message}`;
    } finally {
        discoverBtn.disabled = false;
        discoverBtn.innerHTML = originalText;
    }
};

window._deleteProfileFromModal = function(id, name) {
    if (confirm(`¿Eliminar perfil "${name}"?`)) {
        let profiles = JSON.parse(localStorage.getItem('ai_profiles') || '{}');
        delete profiles[id];
        localStorage.setItem('ai_profiles', JSON.stringify(profiles));

        if (localStorage.getItem('activeProfile') === id) {
            localStorage.removeItem('activeProfile');
        }

        renderProfileManagerList();
        if (typeof window.loadProfiles === 'function') window.loadProfiles();
    }
};

window.injectNIMOption = function() {
    const providerSelect = document.getElementById('ai_provider');
    if (!providerSelect) return;

    if (!providerSelect.querySelector('option[value="nvidia_nim"]')) {
        const nimOpt = document.createElement('option');
        nimOpt.value = 'nvidia_nim';
        nimOpt.textContent = 'NVIDIA NIM';
        providerSelect.appendChild(nimOpt);
    }

    // Ensure we handle provider change with autocomplete
    const originalOnChange = providerSelect.onchange;
    providerSelect.onchange = (e) => {
        const val = providerSelect.value;
        const modelInput = document.getElementById('ai_model');
        const baseUrlInput = document.getElementById('ai_base_url');

        if (val === 'nvidia_nim') {
            baseUrlInput.value = 'https://integrate.api.nvidia.com/v1';
            modelInput.value = 'nvidia/nemotron-3-ultra-550b-a55b';
            handleNIMSelection();
        } else if (val === 'ollama') {
            baseUrlInput.value = 'http://localhost:11434/v1';
            modelInput.value = 'llama3.3';
            if (originalOnChange) originalOnChange.call(providerSelect, e);
        } else if (originalOnChange) {
            originalOnChange.call(providerSelect, e);
        }
    };

    // Redirect DESCUBRIR button
    const discoverBtn = document.querySelector('#group-discover-models button');
    if (discoverBtn) {
        discoverBtn.onclick = () => window._enhancedDiscoverModels();
    }
}

window.handleNIMSelection = function() {
    const modelInput = document.getElementById('ai_model');
    const baseUrlInput = document.getElementById('ai_base_url');
    const apiKeyInput = document.getElementById('ai_api_key');
    const baseUrlGroup = document.getElementById('group-base-url');

    baseUrlInput.value = 'https://integrate.api.nvidia.com/v1';
    modelInput.placeholder = 'nvidia/nemotron-3-ultra-550b-a55b';
    apiKeyInput.placeholder = 'Tu API key empieza con nvapi-';
    baseUrlGroup.style.display = 'block';

    // Hide Ollama specific groups
    ['ollama-scan-btn-group', 'group-ollama-discovery', 'group-ollama-models'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const ollamaHelp = document.getElementById('ollama-help-block');
    if (ollamaHelp) ollamaHelp.classList.add('hidden');
    const discoverGroup = document.getElementById('group-discover-models');
    if (discoverGroup) discoverGroup.style.display = 'block';
}
