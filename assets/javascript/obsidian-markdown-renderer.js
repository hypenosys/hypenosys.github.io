/**
 * OBSIDIAN MARKDOWN RENDERER
 * Handles Obsidian-specific Markdown syntax: Wikilinks, Callouts, Embeds, etc.
 */
window.ObsidianRenderer = (function() {

    // Config for marked.js
    let currentPath = '';
    let allFiles = []; // Flattened tree for resolution

    /**
     * Set current path for relative link resolution
     */
    function setCurrentPath(path) {
        currentPath = path;
    }

    /**
     * Set file index for wikilink resolution
     */
    function setFileIndex(files) {
        allFiles = files;
    }

    /**
     * Normalize string for fuzzy matching
     */
    function normalizeFuzzy(str) {
        if (!str) return '';
        return str.normalize('NFC')
            .toLowerCase()
            .replace(/[^a-z0-9/]/g, '-')
            .replace(/-+/g, '-')
            .replace(/\/+/g, '/')
            .replace(/^-|-$/g, '')
            .replace(/\/-|-\//g, '/');
    }

    /**
     * Resolve Wikilink path to a real repo path
     */
    function resolveWikilinkPath(target, fromPath) {
        if (!target || target === '/') return 'README.md';

        const base = fromPath || currentPath;
        const decoded = decodeURIComponent(target).normalize('NFC').replace(/\\/g, '/');
        const [pathPart, anchor] = decoded.split('#');

        if (!pathPart && anchor) {
            return `${base.split('#')[0]}#${anchor}`;
        }

        const normalizedPart = pathPart.replace(/^\//, '');
        const isNonMd = /\.(png|jpg|jpeg|gif|webp|svg|pdf|zip|rar)$/i.test(normalizedPart);

        // Try exact path first
        if (allFiles.some(f => f.path === normalizedPart)) {
            return anchor ? `${normalizedPart}#${anchor}` : normalizedPart;
        }

        // Try adding .md
        if (!isNonMd && !normalizedPart.includes('.')) {
            const withMd = normalizedPart + '.md';
            if (allFiles.some(f => f.path === withMd)) {
                return anchor ? `${withMd}#${anchor}` : withMd;
            }
        }

        // Fuzzy matching (Obsidian style)
        const targetFuzzy = normalizeFuzzy(normalizedPart);
        const targetFilenameFuzzy = normalizeFuzzy(normalizedPart.split('/').pop());

        const matches = allFiles.filter(f => {
            const fPath = f.path;
            const fPathFuzzy = normalizeFuzzy(fPath);
            const fName = fPath.split('/').pop();
            const fNameFuzzy = normalizeFuzzy(fName.replace('.md', ''));

            return fPathFuzzy === targetFuzzy ||
                   fPathFuzzy.endsWith('/' + targetFuzzy) ||
                   fNameFuzzy === targetFilenameFuzzy;
        });

        if (matches.length > 0) {
            // Sorting logic could be added here for better proximity
            const best = matches[0].path;
            return anchor ? `${best}#${anchor}` : best;
        }

        return anchor ? `${normalizedPart}#${anchor}` : normalizedPart;
    }

    // --- Marked Extensions ---

    // Wikilinks: [[Note]] or ![[Embed]]
    const wikilinkExtension = {
        name: 'wikilink',
        level: 'inline',
        start(src) { return src.indexOf('['); },
        tokenizer(src, tokens) {
            const rule = /^(!)?\[\[([^\]|#^]+)(?:#([^\]|^|]+))?(?:\^([^\]|]+))?(?:\|([^\]]+))?\]\]/;
            const match = rule.exec(src);
            if (match) {
                return {
                    type: 'wikilink',
                    raw: match[0],
                    isEmbed: !!match[1],
                    target: match[2].trim(),
                    heading: match[3] ? match[3].trim() : null,
                    blockId: match[4] ? match[4].trim() : null,
                    text: match[5] ? match[5].trim() : match[2].trim()
                };
            }
        },
        renderer(token) {
            let href = token.target;
            if (token.heading) href += '#' + token.heading;
            else if (token.blockId) href += '#^' + token.blockId;

            const resolved = resolveWikilinkPath(href);

            if (token.isEmbed) {
                const isImage = /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(resolved);
                if (isImage) {
                    const url = window.HypenosysDocsClient.getRawUrl(resolved);
                    return `<img src="${url}" alt="${token.text}" class="obsidian-embed-image">`;
                }
                // For note embeds, we show a link or could implement transclusion later
                return `<div class="obsidian-embed-note">
                            <div class="embed-title"><i class="fas fa-link"></i> ${token.text}</div>
                            <a href="#${resolved}" class="wikilink-active">Abrir nota embeded</a>
                        </div>`;
            }

            return `<a href="#${resolved}" class="wikilink-active">${token.text}${token.heading ? ' > ' + token.heading : ''}</a>`;
        }
    };

    // Callouts: > [!info]
    const calloutExtension = {
        name: 'callout',
        level: 'block',
        start(src) { return src.indexOf('>'); },
        tokenizer(src, tokens) {
            const rule = /^> \[!(\w+)\]([+-])? ?([^\n]*)\n((?:>.*\n?)*)/;
            const match = rule.exec(src);
            if (match) {
                const type = match[1].toLowerCase();
                const collapse = match[2]; // + or -
                const title = match[3].trim() || type.charAt(0).toUpperCase() + type.slice(1);
                const content = match[4].replace(/^> ?/gm, '');

                return {
                    type: 'callout',
                    raw: match[0],
                    calloutType: type,
                    collapse: collapse,
                    title: title,
                    content: content
                };
            }
        },
        renderer(token) {
            const iconMap = {
                note: 'fa-pen',
                tip: 'fa-lightbulb',
                warning: 'fa-triangle-exclamation',
                info: 'fa-info-circle',
                todo: 'fa-check-circle',
                important: 'fa-exclamation-circle',
                caution: 'fa-hand-dots',
                failure: 'fa-xmark-circle',
                danger: 'fa-bolt',
                bug: 'fa-bug',
                example: 'fa-list-ul',
                quote: 'fa-quote-left',
                success: 'fa-check'
            };
            const icon = iconMap[token.calloutType] || 'fa-info-circle';
            const isCollapsed = token.collapse === '-';

            return `
                <div class="obsidian-callout callout-${token.calloutType} ${token.collapse ? 'is-collapsible' : ''}">
                    <div class="callout-header" onclick="${token.collapse ? 'this.parentElement.classList.toggle(\'is-collapsed\')' : ''}">
                        <i class="fas ${icon}"></i>
                        <span class="callout-title">${token.title}</span>
                        ${token.collapse ? '<i class="fas fa-chevron-down callout-fold"></i>' : ''}
                    </div>
                    <div class="callout-content" ${isCollapsed ? 'style="display:none"' : ''}>
                        ${marked.parse(token.content)}
                    </div>
                </div>
            `;
        }
    };

    // Highlight: ==text==
    const highlightExtension = {
        name: 'highlight',
        level: 'inline',
        start(src) { return src.indexOf('='); },
        tokenizer(src, tokens) {
            const rule = /^==([^=]+)==/;
            const match = rule.exec(src);
            if (match) {
                return {
                    type: 'highlight',
                    raw: match[0],
                    text: match[1]
                };
            }
        },
        renderer(token) {
            return `<mark class="obsidian-highlight">${token.text}</mark>`;
        }
    };

    // Footnotes: [^1] and [^1]: content
    const footnoteRefExtension = {
        name: 'footnoteRef',
        level: 'inline',
        start(src) { return src.indexOf('['); },
        tokenizer(src, tokens) {
            const rule = /^\[\^([^\]]+)\]/;
            const match = rule.exec(src);
            if (match) {
                return {
                    type: 'footnoteRef',
                    raw: match[0],
                    id: match[1]
                };
            }
        },
        renderer(token) {
            return `<sup class="footnote-ref"><a href="#fn-${token.id}" id="fnref-${token.id}">${token.id}</a></sup>`;
        }
    };

    const footnoteDefExtension = {
        name: 'footnoteDef',
        level: 'block',
        start(src) { return src.indexOf('['); },
        tokenizer(src, tokens) {
            const rule = /^\[\^([^\]]+)\]: ([^\n]*)/;
            const match = rule.exec(src);
            if (match) {
                return {
                    type: 'footnoteDef',
                    raw: match[0],
                    id: match[1],
                    content: match[2]
                };
            }
        },
        renderer(token) {
            return `<div class="footnote-def" id="fn-${token.id}">
                <span class="footnote-label">${token.id}:</span> ${token.content}
                <a href="#fnref-${token.id}" class="footnote-backref">↩</a>
            </div>`;
        }
    };

    // Inline Footnotes: ^[text]
    const inlineFootnoteExtension = {
        name: 'inlineFootnote',
        level: 'inline',
        start(src) { return src.indexOf('^'); },
        tokenizer(src, tokens) {
            const rule = /^\^\[([^\]]+)\]/;
            const match = rule.exec(src);
            if (match) {
                return {
                    type: 'inlineFootnote',
                    raw: match[0],
                    content: match[1]
                };
            }
        },
        renderer(token) {
            return `<span class="footnote-inline">(${token.content})</span>`;
        }
    };

    // Obsidian Comments: %%text%%
    const commentExtension = {
        name: 'obsidianComment',
        level: 'inline',
        start(src) { return src.indexOf('%'); },
        tokenizer(src, tokens) {
            const rule = /^%%([\s\S]*?)%%/;
            const match = rule.exec(src);
            if (match) {
                return {
                    type: 'obsidianComment',
                    raw: match[0]
                };
            }
        },
        renderer(token) {
            return ''; // Hide comments
        }
    };

    /**
     * Parse Frontmatter (YAML)
     */
    function parseFrontmatter(md) {
        const rule = /^---\n([\s\S]*?)\n---/;
        const match = rule.exec(md);
        if (match) {
            const yaml = match[1];
            const properties = {};
            yaml.split('\n').forEach(line => {
                const [key, ...val] = line.split(':');
                if (key && val.length > 0) {
                    properties[key.trim()] = val.join(':').trim();
                }
            });
            return {
                properties,
                content: md.replace(rule, '')
            };
        }
        return { properties: {}, content: md };
    }

    /**
     * Render structured fallback for .base or .canvas files
     */
    function renderStructuredFallback(content, filename) {
        const isCanvas = filename.endsWith('.canvas');
        const type = isCanvas ? 'JSON Canvas' : 'Obsidian Base';
        const icon = isCanvas ? 'fa-project-diagram' : 'fa-database';

        try {
            const data = JSON.parse(content);
            let html = `
                <div class="structured-fallback">
                    <div class="fallback-header">
                        <i class="fas ${icon}"></i> <span>${type}: ${filename}</span>
                    </div>
                    <div class="fallback-body">
                        <p class="text-xs text-slate-400 mb-4">Este archivo requiere una visualización especializada. Mostrando estructura básica:</p>
            `;

            if (isCanvas) {
                html += `<div class="canvas-summary">
                    <div class="stat">Nodes: ${data.nodes?.length || 0}</div>
                    <div class="stat">Edges: ${data.edges?.length || 0}</div>
                </div>
                <ul class="node-list">
                    ${(data.nodes || []).slice(0, 10).map(n => `<li>[${n.type}] ${n.text || n.file || n.id}</li>`).join('')}
                    ${data.nodes?.length > 10 ? '<li>...</li>' : ''}
                </ul>`;
            } else {
                html += `<pre class="text-[10px] bg-slate-900 p-2 rounded">${JSON.stringify(data, null, 2)}</pre>`;
            }

            html += `</div></div>`;
            return html;
        } catch (e) {
            return `<div class="error-fallback">Error al parsear ${type}</div>`;
        }
    }

    /**
     * Setup Marked with extensions
     */
    function init() {
        marked.use({
            extensions: [
                wikilinkExtension,
                calloutExtension,
                highlightExtension,
                commentExtension,
                footnoteRefExtension,
                footnoteDefExtension,
                inlineFootnoteExtension
            ],
            renderer: {
                // Link overrides for standard markdown links
                link(payload) {
                    let href, title, text;
                    if (typeof payload === 'object' && payload !== null) {
                        ({ href, title, text } = payload);
                    } else {
                        href = arguments[0];
                        title = arguments[1];
                        text = arguments[2];
                    }

                    if (href && !href.startsWith('http') && !href.startsWith('mailto:') && !href.startsWith('#')) {
                        const resolved = resolveWikilinkPath(href);
                        return `<a href="#${resolved}" class="wikilink-active">${text}</a>`;
                    }
                    return false; // use default
                },
                // Image overrides for standard markdown images
                image(payload) {
                    let href, title, text;
                    if (typeof payload === 'object' && payload !== null) {
                        ({ href, title, text } = payload);
                    } else {
                        href = arguments[0];
                        title = arguments[1];
                        text = arguments[2];
                    }

                    if (href && !href.startsWith('http')) {
                        const resolved = resolveWikilinkPath(href);
                        const url = window.HypenosysDocsClient.getRawUrl(resolved);
                        return `<img src="${url}" alt="${text}" ${title ? `title="${title}"` : ''}>`;
                    }
                    return false;
                }
            }
        });

        // Mermaid Support
        if (window.mermaid) {
            window.mermaid.initialize({ startOnLoad: false, theme: 'dark' });
        }
    }

    /**
     * Main Render function
     */
    async function render(md, path) {
        setCurrentPath(path);
        const { properties, content } = parseFrontmatter(md);

        // Check for special formats
        if (path.endsWith('.canvas') || path.endsWith('.base')) {
            return renderStructuredFallback(md, path);
        }

        let rendered = marked.parse(content);

        // Post-processing for Block IDs
        rendered = rendered.replace(/\^([a-zA-Z0-9-]+)(?=\s|$)/g, '<span id="$1" class="block-id"></span>');

        // Properties header
        let propertiesHtml = '';
        if (Object.keys(properties).length > 0) {
            propertiesHtml = `
                <details class="obsidian-properties mb-6">
                    <summary class="text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer hover:text-slate-300">Propiedades</summary>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 p-3 bg-slate-900/50 rounded-lg mt-2 border border-slate-800">
                        ${Object.entries(properties).map(([k, v]) => `
                            <div class="flex items-center gap-2">
                                <span class="text-[9px] text-indigo-400 font-mono">${k}:</span>
                                <span class="text-[10px] text-slate-300">${v}</span>
                            </div>
                        `).join('')}
                    </div>
                </details>
            `;
        }

        return propertiesHtml + rendered;
    }

    return {
        init,
        render,
        setCurrentPath,
        setFileIndex,
        resolveWikilinkPath
    };
})();
