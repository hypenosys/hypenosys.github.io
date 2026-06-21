/**
 * HYPENOSYS — Profile Editor Module
 * Encapsulates modal logic, data synchronization, and localStorage management.
 */

(function() {
    const AI_CONFIG_KEY = 'hy_ai_config';

    const PROVIDER_DEFAULTS = {
        'anthropic':  'claude-sonnet-4-6-20260217',
        'openai':     'gpt-5',
        'gemini':     'gemini-2.5-flash',
        'mistral':    'mistral-large-latest',
        'openrouter': 'openrouter/auto',
        'ollama':     'llama3',
        'custom':     ''
    };

    class ProfileEditor {
        constructor() {
            this.init();
        }

        init() {
            this.injectModal();
            this.bindEvents();
        }

        injectModal() {
            if (document.getElementById('modalEditProfile')) return;

            const modalHtml = `
            <div class="modal fade" id="modalEditProfile" tabindex="-1" role="dialog" aria-labelledby="modalEditProfileLabel" aria-hidden="true">
                <div class="modal-dialog modal-lg modal-dialog-centered" role="document">
                    <div class="modal-content bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl overflow-hidden shadow-2xl">
                        <div class="modal-header border-b border-slate-800 p-6 flex justify-between items-center">
                            <h5 class="modal-title font-bold text-xl flex items-center gap-3" id="modalEditProfileLabel">
                                <div class="w-10 h-10 rounded-full bg-indigo-900/30 flex items-center justify-center text-indigo-400 border border-indigo-500/30">
                                    <i class="fa-solid fa-user-gear"></i>
                                </div>
                                Mi Perfil de Operaciones
                            </h5>
                            <button type="button" class="close text-slate-500 hover:text-white transition-colors outline-none text-2xl" data-dismiss="modal" aria-label="Close">
                                <span aria-hidden="true">&times;</span>
                            </button>
                        </div>
                        <div class="modal-body p-0">
                            <!-- Tabs Navigation -->
                            <ul class="nav nav-tabs border-b border-slate-800 bg-slate-950/30 px-6" id="profileTabs" role="tablist">
                                <li class="nav-item" role="presentation">
                                    <a class="nav-link active bg-transparent border-0 text-slate-400 py-4 px-6 font-bold text-[10px] uppercase tracking-widest hover:text-white transition-all cursor-pointer" id="mi-perfil-tab" data-toggle="tab" href="#mi-perfil-pane" role="tab" aria-controls="mi-perfil-pane" aria-selected="true">
                                        <i class="fa-solid fa-id-card mr-2"></i> Mi Perfil
                                    </a>
                                </li>
                                <li class="nav-item" role="presentation">
                                    <a class="nav-link bg-transparent border-0 text-slate-400 py-4 px-6 font-bold text-[10px] uppercase tracking-widest hover:text-white transition-all cursor-pointer" id="config-api-tab" data-toggle="tab" href="#config-api-pane" role="tab" aria-controls="config-api-pane" aria-selected="false">
                                        <i class="fa-solid fa-key mr-2"></i> Configuración API
                                    </a>
                                </li>
                            </ul>

                            <div class="tab-content p-6 max-h-[60vh] overflow-y-auto custom-scrollbar" id="profileTabsContent">
                                <!-- Mi Perfil Tab -->
                                <div class="tab-pane fade show active" id="mi-perfil-pane" role="tabpanel" aria-labelledby="mi-perfil-tab">
                                    <div class="space-y-6">
                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Nombre Público</label>
                                                <input type="text" id="prof-display-name" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-sm" placeholder="Ej: Axel (El Afaces)">
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Rol / Especialidad</label>
                                                <input type="text" id="prof-role" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-sm" placeholder="Ej: Lead Developer">
                                            </div>
                                        </div>

                                        <div>
                                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Biografía Corta</label>
                                            <textarea id="prof-bio" rows="3" maxlength="200" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-sm" placeholder="Cuéntanos un poco sobre ti..."></textarea>
                                            <div class="text-right mt-1">
                                                <small id="prof-bio-counter" class="text-[9px] font-mono text-slate-600 uppercase tracking-widest">0 / 200 caracteres</small>
                                            </div>
                                        </div>

                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">URL del Avatar</label>
                                                <div class="flex gap-4">
                                                    <div class="flex-grow">
                                                        <input type="text" id="prof-avatar-url" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-[11px] font-mono" placeholder="https://github.com/usuario.png">
                                                    </div>
                                                    <div class="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 overflow-hidden flex-shrink-0 shadow-lg">
                                                        <img id="prof-avatar-preview" src="assets/images/upload_soul.svg" class="w-full h-full object-cover">
                                                    </div>
                                                </div>
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Email de Contacto</label>
                                                <input type="email" id="prof-email" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-sm" placeholder="usuario@hypenosys.com">
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <!-- Configuración API Tab -->
                                <div class="tab-pane fade" id="config-api-pane" role="tabpanel" aria-labelledby="config-api-tab">
                                    <div class="space-y-6">
                                        <!-- Warning Banner -->
                                        <div class="bg-amber-900/10 border border-amber-500/20 rounded-xl p-4 flex gap-4">
                                            <div class="text-amber-500 text-xl flex-shrink-0"><i class="fa-solid fa-triangle-exclamation"></i></div>
                                            <div class="text-[10px] text-amber-200/60 leading-relaxed uppercase tracking-wider">
                                                <strong class="text-amber-400 block mb-1 font-black">Atención: Seguridad de Datos</strong>
                                                Tu API key se guarda <span class="text-amber-300">solo en este navegador</span> (localStorage). Nunca se sube a GitHub ni se comparte con otros miembros del equipo.
                                            </div>
                                        </div>

                                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Proveedor de IA</label>
                                                <select id="prof-ai-provider" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-sm">
                                                    <option value="none">Ninguno (Desactivado)</option>
                                                    <option value="anthropic">Anthropic (Claude)</option>
                                                    <option value="openai">OpenAI (GPT)</option>
                                                    <option value="gemini">Google Gemini</option>
                                                    <option value="mistral">Mistral AI</option>
                                                    <option value="openrouter">OpenRouter</option>
                                                    <option value="ollama">Ollama (Local)</option>
                                                    <option value="custom">Custom Endpoint</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Modelo Sugerido / Manual</label>
                                                <input type="text" id="prof-ai-model" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-[11px] font-mono" placeholder="modelo-id">
                                            </div>
                                        </div>

                                        <div>
                                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">API Key</label>
                                            <div class="relative">
                                                <input type="password" id="prof-ai-key" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 pr-12 text-slate-100 focus:border-indigo-500 outline-none transition-all font-mono text-[11px]" placeholder="sk-...">
                                                <button type="button" id="toggle-ai-key" class="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                                                    <i class="fa-solid fa-eye"></i>
                                                </button>
                                            </div>
                                        </div>

                                        <div id="container-ai-base-url" class="hidden">
                                            <label class="block text-[10px] font-bold text-slate-500 uppercase mb-2 tracking-widest">Base URL (API Endpoint)</label>
                                            <input type="text" id="prof-ai-url" class="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 focus:border-indigo-500 outline-none transition-all text-[11px] font-mono" placeholder="http://localhost:11434/v1">
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer border-t border-slate-800 p-6 bg-slate-950/50 flex gap-3">
                            <button type="button" class="flex-grow py-3 border border-slate-700 hover:bg-slate-800 rounded-xl font-bold text-xs transition-all uppercase tracking-widest" data-dismiss="modal">Cancelar</button>
                            <button type="button" id="btn-save-profile-editor" class="flex-grow py-3 bg-emerald-500 hover:bg-emerald-600 text-slate-950 rounded-xl font-bold text-xs transition-all uppercase tracking-widest shadow-lg shadow-emerald-500/10">Guardar Perfil</button>
                        </div>
                    </div>
                </div>
            </div>`;

            const wrapper = document.createElement('div');
            wrapper.id = 'profile-editor-modal-wrapper';
            wrapper.innerHTML = modalHtml;
            document.body.appendChild(wrapper);
        }

        bindEvents() {
            // Save button
            const btnSave = document.getElementById('btn-save-profile-editor');
            if (btnSave) btnSave.onclick = () => this.saveProfile();

            // Bio counter
            const bioArea = document.getElementById('prof-bio');
            if (bioArea) {
                bioArea.oninput = () => this.updateBioCounter();
            }

            // Avatar preview (debounced)
            const avatarInput = document.getElementById('prof-avatar-url');
            if (avatarInput) {
                let debounceTimer;
                avatarInput.oninput = () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => this.updateAvatarPreview(), 500);
                };
            }

            // AI Provider changes
            const providerSelect = document.getElementById('prof-ai-provider');
            if (providerSelect) {
                providerSelect.onchange = () => this.handleProviderChange();
            }

            // AI Key toggle
            const toggleKeyBtn = document.getElementById('toggle-ai-key');
            if (toggleKeyBtn) {
                toggleKeyBtn.onclick = () => {
                    const input = document.getElementById('prof-ai-key');
                    const icon = toggleKeyBtn.querySelector('i');
                    if (input.type === 'password') {
                        input.type = 'text';
                        icon.classList.replace('fa-eye', 'fa-eye-slash');
                    } else {
                        input.type = 'password';
                        icon.classList.replace('fa-eye-slash', 'fa-eye');
                    }
                };
            }
        }

        async openModal() {
            if (!window.githubApi.user) {
                window.hypeToast('Debes iniciar sesión para editar tu perfil', 'error');
                return;
            }

            const login = window.githubApi.user.login;
            console.log(`[ProfileEditor] Opening modal for user: ${login}`);

            // Populate fields FIRST to avoid flashing empty modal
            try {
                const response = await fetch('/assets/data/team_profiles.json');
                if (!response.ok) throw new Error('No se pudo cargar team_profiles.json');
                const profilesRes = await response.json();
                const profiles = profilesRes.members || {};
                console.log('[ProfileEditor] Fetched profiles:', profiles);

                // Find entry by github_login (case insensitive)
                let memberData = Object.values(profiles).find(m => {
                    const mLogin = (m.github_login || m.github_username || "").toLowerCase();
                    return mLogin === login.toLowerCase();
                });

                console.log('[ProfileEditor] Matched member data:', memberData);

                if (!memberData) {
                    console.log(`[ProfileEditor] No entry found for ${login}, using defaults.`);
                    memberData = {
                        display_name: window.githubApi.user.name || login,
                        role: 'Team Member',
                        bio: '',
                        avatar_url: window.githubApi.user.avatar_url || '',
                        contact_email: window.githubApi.user.email || '',
                        ai_config: { provider: 'none', model: '' }
                    };
                }

                // Load from localStorage for API keys
                const localAiConfig = JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || '{}');

                // Populate fields
                document.getElementById('prof-display-name').value = memberData.display_name || '';
                document.getElementById('prof-role').value = memberData.role || '';
                document.getElementById('prof-bio').value = memberData.bio || '';
                document.getElementById('prof-avatar-url').value = memberData.avatar_url || '';
                document.getElementById('prof-email').value = memberData.contact_email || '';

                // Sync with localStorage or fallback to JSON data
                const provider = localAiConfig.provider || memberData.ai_config?.provider || 'none';
                const model = localAiConfig.model || memberData.ai_config?.model || '';
                const baseUrl = localAiConfig.base_url || '';
                const apiKey = localAiConfig.api_key || '';

                document.getElementById('prof-ai-provider').value = provider;
                document.getElementById('prof-ai-model').value = model;
                document.getElementById('prof-ai-key').value = apiKey;
                document.getElementById('prof-ai-url').value = baseUrl;

                this.updateBioCounter();
                this.updateAvatarPreview();
                this.handleProviderChange(); // To show/hide base url

                // Show modal AFTER populating
                $('#modalEditProfile').modal('show');

            } catch (err) {
                console.error('[ProfileEditor] Error loading profile:', err);
                window.hypeToast('Error al cargar datos del perfil', 'error');
            }
        }

        updateBioCounter() {
            const bio = document.getElementById('prof-bio').value;
            const counter = document.getElementById('prof-bio-counter');
            if (counter) {
                counter.textContent = `${bio.length} / 200 caracteres`;
                counter.className = bio.length >= 180 ? 'text-[9px] font-mono text-amber-500 uppercase tracking-widest' : 'text-[9px] font-mono text-slate-600 uppercase tracking-widest';
            }
        }

        updateAvatarPreview() {
            const url = document.getElementById('prof-avatar-url').value.trim();
            const preview = document.getElementById('prof-avatar-preview');
            if (preview) {
                preview.src = url || 'assets/images/upload_soul.svg';
                preview.onerror = () => { preview.src = 'assets/images/upload_soul.svg'; };
            }
        }

        handleProviderChange() {
            const provider = document.getElementById('prof-ai-provider').value;
            const modelInput = document.getElementById('prof-ai-model');
            const urlContainer = document.getElementById('container-ai-base-url');

            // Update placeholder
            if (modelInput) {
                modelInput.placeholder = PROVIDER_DEFAULTS[provider] || 'modelo-id';
            }

            // Show/Hide base URL
            if (urlContainer) {
                if (provider === 'ollama' || provider === 'custom') {
                    urlContainer.classList.remove('hidden');
                    if (provider === 'ollama' && !document.getElementById('prof-ai-url').value) {
                        document.getElementById('prof-ai-url').value = 'http://localhost:11434/v1';
                    }
                } else {
                    urlContainer.classList.add('hidden');
                }
            }
        }

        async saveProfile() {
            const login = window.githubApi.user?.login;
            if (!login || !login.trim()) return;

            const btn = document.getElementById('btn-save-profile-editor');
            const originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Guardando...';

            // Gather data
            const display_name = document.getElementById('prof-display-name').value.trim();
            const role = document.getElementById('prof-role').value.trim();
            const bio = document.getElementById('prof-bio').value.trim();
            const avatar_url = document.getElementById('prof-avatar-url').value.trim();
            const contact_email = document.getElementById('prof-email').value.trim();

            const ai_provider = document.getElementById('prof-ai-provider').value;
            const ai_model = document.getElementById('prof-ai-model').value.trim() || PROVIDER_DEFAULTS[ai_provider] || '';
            const ai_key = document.getElementById('prof-ai-key').value.trim();
            const ai_url = document.getElementById('prof-ai-url').value.trim();

            try {
                // 1. Update team_profiles.json
                await window.githubApi.atomicWrite('assets/data/team_profiles.json', (db) => {
                    db.members = db.members || {};
                    let memberKey = Object.keys(db.members).find(k => {
                        const m = db.members[k];
                        return (m.github_login || m.github_username)?.toLowerCase() === login.toLowerCase();
                    });

                    if (!memberKey) {
                        // User doesn't exist, create entry using login as key
                        memberKey = login;
                        db.members[memberKey] = {
                            github_login: login
                        };
                    }

                    db.members[memberKey] = {
                        ...db.members[memberKey],
                        github_login: login,
                        github_username: login, // Backward compatibility
                        display_name,
                        role,
                        bio,
                        avatar_url,
                        contact_email,
                        ai_config: {
                            provider: ai_provider,
                            model: ai_model
                        }
                    };

                    return db;
                }, `chore: actualizar perfil de ${login}`);

                // 2. Update team.json (if exists)
                await window.githubApi.atomicWrite('assets/data/team.json', (team) => {
                    if (!Array.isArray(team)) return team;

                    const searchLogin = login.toLowerCase();
                    const memberIndex = team.findIndex(m => {
                        if (!m.github) return false;
                        const url = m.github.toLowerCase().replace(/\/$/, "");
                        return url.endsWith('/' + searchLogin) || url === searchLogin;
                    });

                    if (memberIndex !== -1) {
                        team[memberIndex].name = display_name;
                        team[memberIndex].role = role;
                        team[memberIndex].image = avatar_url;
                    }
                    return team;
                }, `chore: sincronizar team.json con perfil de ${login}`);

                // 3. Store sensitive data in localStorage
                const localAiConfig = {
                    api_key: ai_key,
                    provider: ai_provider,
                    model: ai_model,
                    base_url: ai_url
                };
                localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(localAiConfig));

                // 4. Update internal state and UI
                window.githubApi.user.avatar_url = avatar_url;
                window.githubApi.user.name = display_name;

                if (typeof renderUserStatus === 'function') {
                    renderUserStatus(window.githubApi.user);
                }

                window.hypeToast('Perfil actualizado correctamente ✓', 'success');
                $('#modalEditProfile').modal('hide');

            } catch (err) {
                console.error('[ProfileEditor] Save failed:', err);
                window.hypeToast('Error al guardar. Inténtalo de nuevo.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = originalHtml;
            }
        }
    }

    // Initialize and expose to window
    window.profileEditor = new ProfileEditor();

})();
