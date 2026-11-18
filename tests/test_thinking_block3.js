const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Mock window and localStorage for Node test runner
global.window = global;
global.localStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, val) { this._data[key] = String(val); },
    removeItem(key) { delete this._data[key]; }
};

// Load Block 1, 2 & 3 modules
const capabilitiesCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-capabilities.js'), 'utf8');
eval(capabilitiesCode);

const adaptersCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-adapters.js'), 'utf8');
eval(adaptersCode);

const parserCode = fs.readFileSync(path.join(__dirname, '../assets/javascript/neural-thinking-parser.js'), 'utf8');
eval(parserCode);

console.log("=== RUNNING BLOCK 3 UNIT TESTS ===");

const Parser = window.NeuralThinkingParser;

// 1. Fixture Anthropic Thinking Delta
const anthropicChunks = [
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'Analizando...' } },
    { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: ' Pensamiento completado.' } },
    { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Respuesta final de Claude.' } }
];

const state1 = Parser.createParseState();
let anthropicThinking = '';
let anthropicContent = '';

anthropicChunks.forEach(chunk => {
    const res = Parser.parseChunk('anthropic', chunk, state1);
    anthropicThinking += res.thinkingDelta;
    anthropicContent += res.contentDelta;
});

assert.strictEqual(anthropicThinking, 'Analizando... Pensamiento completado.');
assert.strictEqual(anthropicContent, 'Respuesta final de Claude.');
console.log("✓ Fixture 1: Anthropic thinking_delta & text_delta OK");

// 2. Fixture Gemini Thinking Tags (<thought>...</thought>)
const geminiChunks = [
    { choices: [{ delta: { content: '<thought>Pensando en Gemini...' } }] },
    { choices: [{ delta: { content: '</thought>Respuesta Gemini.' } }] }
];

const state2 = Parser.createParseState();
let geminiThinking = '';
let geminiContent = '';

geminiChunks.forEach(chunk => {
    const res = Parser.parseChunk('gemini', chunk, state2);
    geminiThinking += res.thinkingDelta;
    geminiContent += res.contentDelta;
});

assert.strictEqual(geminiThinking, 'Pensando en Gemini...');
assert.strictEqual(geminiContent, 'Respuesta Gemini.');
console.log("✓ Fixture 2: Gemini <thought>...</thought> inline tags OK");

// 3. Fixture Ollama Native (/api/chat message.thinking & message.content)
const ollamaChunks = [
    { message: { thinking: 'Razonamiento en Ollama local.' } },
    { message: { content: 'Respuesta final Ollama.' } }
];

const state3 = Parser.createParseState();
let ollamaThinking = '';
let ollamaContent = '';

ollamaChunks.forEach(chunk => {
    const res = Parser.parseChunk('ollama', chunk, state3);
    ollamaThinking += res.thinkingDelta;
    ollamaContent += res.contentDelta;
});

assert.strictEqual(ollamaThinking, 'Razonamiento en Ollama local.');
assert.strictEqual(ollamaContent, 'Respuesta final Ollama.');
console.log("✓ Fixture 3: Ollama native message.thinking & message.content OK");

// 4. Fixture Mistral List Chunks
const mistralChunks = [
    { choices: [{ delta: { content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'Pensando en Mistral.' }] }] } }] },
    { choices: [{ delta: { content: [{ type: 'text', text: 'Respuesta Mistral.' }] } }] }
];

const state4 = Parser.createParseState();
let mistralThinking = '';
let mistralContent = '';

mistralChunks.forEach(chunk => {
    const res = Parser.parseChunk('mistral', chunk, state4);
    mistralThinking += res.thinkingDelta;
    mistralContent += res.contentDelta;
});

assert.strictEqual(mistralThinking, 'Pensando en Mistral.');
assert.strictEqual(mistralContent, 'Respuesta Mistral.');
console.log("✓ Fixture 4: Mistral ThinkChunk array parsing OK");

// 5. Fixture NIM / OpenRouter reasoning_content
const nimChunks = [
    { choices: [{ delta: { reasoning_content: 'Razonando en NIM.' } }] },
    { choices: [{ delta: { content: 'Respuesta NIM.' } }] }
];

const state5 = Parser.createParseState();
let nimThinking = '';
let nimContent = '';

nimChunks.forEach(chunk => {
    const res = Parser.parseChunk('nvidia_nim', chunk, state5);
    nimThinking += res.thinkingDelta;
    nimContent += res.contentDelta;
});

assert.strictEqual(nimThinking, 'Razonando en NIM.');
assert.strictEqual(nimContent, 'Respuesta NIM.');
console.log("✓ Fixture 5: NIM reasoning_content OK");

// 6. Fixture Unclosed Tag at EOF
const unclosedChunks = [
    { choices: [{ delta: { content: '<think>Razonamiento sin cerrar' } }] }
];

const state6 = Parser.createParseState();
let unclosedThinking = '';
let unclosedContent = '';

unclosedChunks.forEach(chunk => {
    const res = Parser.parseChunk('custom', chunk, state6);
    unclosedThinking += res.thinkingDelta;
    unclosedContent += res.contentDelta;
});

const eofFlushed = Parser.flushEof(state6);
unclosedThinking += eofFlushed.thinkingDelta;
unclosedContent += eofFlushed.contentDelta;

assert.strictEqual(unclosedThinking, 'Razonamiento sin cerrar');
assert.strictEqual(unclosedContent, '');
assert.ok(!unclosedContent.includes('<think>'), "Literal Assert 1: content must NOT contain <think>");
console.log("✓ Fixture 6: Unclosed tag at EOF auto-close OK");

// 7. Fixture Tags inside Markdown Codeblock & Codeblock Closure Followed by Real Tag
const codeblockChunks = [
    { choices: [{ delta: { content: '```xml\n<think>tag en codigo</think>\n`' } }] },
    { choices: [{ delta: { content: '``\nTexto post codigo. <think>Razonamiento real post codigo</think>' } }] }
];

const state7 = Parser.createParseState();
let codeThinking = '';
let codeContent = '';

codeblockChunks.forEach(chunk => {
    const res = Parser.parseChunk('custom', chunk, state7);
    codeThinking += res.thinkingDelta;
    codeContent += res.contentDelta;
});

// Assert (a): <think> inside codeblock remains in content and NOT in thinking
assert.ok(codeContent.includes('<think>tag en codigo</think>'), "Assert A: <think> inside codeblock remains in content");
assert.ok(!codeThinking.includes('tag en codigo'), "Assert A: <think> inside codeblock is NOT in thinking");

// Assert (b): Real <think> after codeblock goes to thinking and NOT in content
assert.strictEqual(codeThinking, 'Razonamiento real post codigo', "Assert B: real <think> after codeblock goes to thinking");
assert.ok(!codeContent.includes('Razonamiento real post codigo'), "Assert B: real <think> after codeblock is NOT in content");

console.log("✓ Fixture 7: Codeblock split backticks & codeblock closure followed by real tag OK");

// 8. Fixture Single-Character Split Chunks (<, t, h, i, n, k, >)
const splitChars = ['<', 't', 'h', 'i', 'n', 'k', '>', 'P', 'e', 'n', 's', 'a', 'n', 'd', 'o', '<', '/', 't', 'h', 'i', 'n', 'k', '>', 'F', 'i', 'n'];

const state8 = Parser.createParseState();
let splitThinking = '';
let splitContent = '';

splitChars.forEach(char => {
    const chunk = { choices: [{ delta: { content: char } }] };
    const res = Parser.parseChunk('custom', chunk, state8);
    splitThinking += res.thinkingDelta;
    splitContent += res.contentDelta;
});

assert.strictEqual(splitThinking, 'Pensando');
assert.strictEqual(splitContent, 'Fin');
console.log("✓ Fixture 8: 1-character split chunks buffer resilience OK");

// 9. Fixture <thinking> and <thought> Split Chunks
const splitTagsChunks = [
    { choices: [{ delta: { content: '<think' } }] },
    { choices: [{ delta: { content: 'ing>Pensando en thinking' } }] },
    { choices: [{ delta: { content: '</think' } }] },
    { choices: [{ delta: { content: 'ing>Texto post thinking. ' } }] },
    { choices: [{ delta: { content: '<thou' } }] },
    { choices: [{ delta: { content: 'ght>Pensando en thought' } }] },
    { choices: [{ delta: { content: '</thou' } }] },
    { choices: [{ delta: { content: 'ght>Texto final' } }] }
];

const state9 = Parser.createParseState();
let splitTagsThinking = '';
let splitTagsContent = '';

splitTagsChunks.forEach(chunk => {
    const res = Parser.parseChunk('custom', chunk, state9);
    splitTagsThinking += res.thinkingDelta;
    splitTagsContent += res.contentDelta;
});

assert.strictEqual(splitTagsThinking, 'Pensando en thinkingPensando en thought');
assert.strictEqual(splitTagsContent, 'Texto post thinking. Texto final');
console.log("✓ Fixture 9: <thinking> and <thought> split tags resilience OK");

// 10. Fixture Mistral String <-> List Transition
const mistralTransitionChunks = [
    { choices: [{ delta: { content: [{ type: 'thinking', thinking: [{ type: 'text', text: 'Thinking list.' }] }] } }] },
    { choices: [{ delta: { content: 'Respuesta string plana.' } }] }
];

const state10 = Parser.createParseState();
let transThinking = '';
let transContent = '';

mistralTransitionChunks.forEach(chunk => {
    const res = Parser.parseChunk('mistral', chunk, state10);
    transThinking += res.thinkingDelta;
    transContent += res.contentDelta;
});

assert.strictEqual(transThinking, 'Thinking list.');
assert.strictEqual(transContent, 'Respuesta string plana.');
console.log("✓ Fixture 10: Mistral string <-> list transition OK");

console.log("=== ALL BLOCK 3 UNIT TESTS PASSED ===");
