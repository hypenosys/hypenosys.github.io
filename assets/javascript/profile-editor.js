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
            this.bindEvents();
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

            // Show loading state or modal immediately
            $('#modalEditProfile').modal('show');

            try {
                const profilesRes = await window.githubApi.fetchFileWithSha('_data/team_profiles.json');
                const profiles = profilesRes.content.members || {};

                // Find entry by github_login (case insensitive) or create defaults
                let memberData = Object.values(profiles).find(m => (m.github_login || m.github_username)?.toLowerCase() === login.toLowerCase());

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
                // If switching and current model is empty or was a default, we could update it
                // but usually it's better to just leave what's there or use placeholder
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
                await window.githubApi.atomicWrite('_data/team_profiles.json', (db) => {
                    db.members = db.members || {};
                    let memberKey = Object.keys(db.members).find(k => (db.members[k].github_login || db.members[k].github_username)?.toLowerCase() === login.toLowerCase());

                    if (!memberKey) {
                        // User doesn't exist, create entry using login as key
                        memberKey = login;
                        db.members[memberKey] = {
                            github_login: login
                        };
                    }

                    db.members[memberKey] = {
                        ...db.members[memberKey],
                        github_login: login, // Requirement 5
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
                await window.githubApi.atomicWrite('_data/team.json', (team) => {
                    if (!Array.isArray(team)) return team;

                    // Precise match: check if URL ends with /login (case insensitive)
                    const searchLogin = login.toLowerCase();
                    const memberIndex = team.findIndex(m => {
                        if (!m.github) return false;
                        const url = m.github.toLowerCase().replace(/\/$/, ""); // remove trailing slash
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
