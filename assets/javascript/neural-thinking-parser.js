/**
 * Neural Thinking Stateful Stream Parser (Block 3)
 * Processes SSE chunks across providers (Anthropic, Gemini, Ollama, Mistral, NIM, OpenRouter)
 * and normalizes deltas into { thinkingDelta, contentDelta }.
 * Supports stateful inline tag parsing (<think>, <thinking>, <thought>) with chunk boundary buffer,
 * EOF auto-close, and Markdown codeblock protection.
 */

window.NeuralThinkingParser = (function() {

    function createParseState() {
        return {
            mode: 'TEXT', // 'TEXT' or 'THINKING'
            tagBuffer: '',
            inCodeBlock: false,
            openTagType: null, // 'think', 'thinking', 'thought'
            accumulatedThinking: '',
            accumulatedContent: ''
        };
    }

    /**
     * Stateful inline tag parser processing raw text chunks.
     * Prevents tag extraction inside Markdown codeblocks (` ``` `).
     * Handles split opening/closing tags across chunk boundaries and split backtick boundaries.
     */
    function parseInlineTags(text, state) {
        if (!text && !state.tagBuffer) return { thinkingDelta: '', contentDelta: '' };

        let thinkingDelta = '';
        let contentDelta = '';

        // Prepend any leftover buffer from previous chunk
        let input = state.tagBuffer + (text || '');
        state.tagBuffer = '';

        let i = 0;
        const len = input.length;

        while (i < len) {
            // Check for Markdown codeblock toggle (```) or partial backticks at buffer end
            if (input.startsWith('```', i)) {
                state.inCodeBlock = !state.inCodeBlock;
                if (state.mode === 'THINKING') {
                    thinkingDelta += '```';
                } else {
                    contentDelta += '```';
                }
                i += 3;
                continue;
            } else if ((input.slice(i) === '`' || input.slice(i) === '``') && i + input.slice(i).length === len) {
                state.tagBuffer = input.slice(i);
                break;
            }

            // If inside a code block, do not parse tags
            if (state.inCodeBlock) {
                const char = input[i];
                if (state.mode === 'THINKING') {
                    thinkingDelta += char;
                } else {
                    contentDelta += char;
                }
                i++;
                continue;
            }

            // Check if at potential tag start '<'
            if (input[i] === '<') {
                const slice = input.slice(i);

                // Open tag patterns
                const openMatch = slice.match(/^<(think|thinking|thought)>/i);
                if (openMatch) {
                    state.mode = 'THINKING';
                    state.openTagType = openMatch[1].toLowerCase();
                    i += openMatch[0].length;
                    continue;
                }

                // Close tag patterns
                const closeMatch = slice.match(/^<\/(think|thinking|thought)>/i);
                if (closeMatch) {
                    state.mode = 'TEXT';
                    state.openTagType = null;
                    i += closeMatch[0].length;
                    continue;
                }

                // Potential partial tag near end of buffer
                if (/^<\/?(t(h(i(n(k(i(n(g)?)?)?)?)?)?)?|t(h(o(u(g(h(t)?)?)?)?)?)?)?$/i.test(slice)) {
                    state.tagBuffer = slice;
                    break;
                }
            }

            // Output character to appropriate delta
            const char = input[i];
            if (state.mode === 'THINKING') {
                thinkingDelta += char;
            } else {
                contentDelta += char;
            }
            i++;
        }

        state.accumulatedThinking += thinkingDelta;
        state.accumulatedContent += contentDelta;

        return { thinkingDelta, contentDelta };
    }

    /**
     * Flush remaining state buffer at EOF ([DONE]).
     * Automatically closes any unclosed thinking tag.
     */
    function flushEof(state) {
        let thinkingDelta = '';
        let contentDelta = '';

        if (state.tagBuffer) {
            if (state.mode === 'THINKING') {
                thinkingDelta += state.tagBuffer;
            } else {
                contentDelta += state.tagBuffer;
            }
            state.tagBuffer = '';
        }

        if (state.mode === 'THINKING') {
            state.mode = 'TEXT';
            state.openTagType = null;
        }

        return { thinkingDelta, contentDelta };
    }

    /**
     * Main parser entry point per provider chunk.
     */
    function parseChunk(provider, rawChunk, state) {
        if (!state) state = createParseState();

        const adapter = window.NeuralThinkingAdapters ? window.NeuralThinkingAdapters.getAdapter(provider) : null;
        let thinkingDelta = '';
        let contentDelta = '';

        if (adapter) {
            const parsed = adapter.parseStream(rawChunk, state);
            thinkingDelta = parsed.thinkingDelta || '';
            contentDelta = parsed.contentDelta || '';
        }

        // If contentDelta contains inline tags or buffer is active
        if (contentDelta || state.tagBuffer) {
            const tagParsed = parseInlineTags(contentDelta, state);
            thinkingDelta += tagParsed.thinkingDelta;
            contentDelta = tagParsed.contentDelta;
        }

        return { thinkingDelta, contentDelta };
    }

    return {
        createParseState,
        parseInlineTags,
        parseChunk,
        flushEof
    };

})();
