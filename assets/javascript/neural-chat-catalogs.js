/* ════════════════════════════════════════
   AI CATALOGS
   ════════════════════════════════════════ */
window.NVIDIA_NIM_CATALOG = {
  chat: [
    // ── Nemotron ──
    { id: 'nvidia/nemotron-3-ultra-550b-a55b',        label: 'Nemotron 3 Ultra 550B' },
    { id: 'nvidia/nemotron-3-super-120b-a12b',        label: 'Nemotron 3 Super 120B (Recomendado)' },
    { id: 'nvidia/nemotron-nano-4b-v1.1',             label: 'Nemotron Nano 4B' },
    // ── Llama ──
    { id: 'meta/llama-3.3-70b-instruct',              label: 'Llama 3.3 70B Instruct' },
    { id: 'meta/llama-3.1-405b-instruct',             label: 'Llama 3.1 405B Instruct' },
    { id: 'meta/llama-3.1-70b-instruct',              label: 'Llama 3.1 70B Instruct' },
    { id: 'meta/llama-3.1-8b-instruct',               label: 'Llama 3.1 8B Instruct' },
    // ── Qwen ──
    { id: 'qwen/qwen3-235b-a22b',                     label: 'Qwen 3 235B' },
    { id: 'qwen/qwen2.5-72b-instruct',                label: 'Qwen 2.5 72B Instruct' },
    { id: 'qwen/qwen2.5-coder-32b-instruct',          label: 'Qwen 2.5 Coder 32B' },
    // ── DeepSeek ──
    { id: 'deepseek-ai/deepseek-r1',                  label: 'DeepSeek R1' },
    { id: 'deepseek-ai/deepseek-v4-flash',            label: 'DeepSeek V4 Flash 284B' },
    // ── Mistral ──
    { id: 'mistralai/mistral-large-2-instruct',       label: 'Mistral Large 2' },
    { id: 'mistralai/mixtral-8x22b-instruct-v0.1',    label: 'Mixtral 8x22B' },
    { id: 'mistralai/mistral-small-24b-instruct-2501',label: 'Mistral Small 24B' },
    // ── Google ──
    { id: 'google/gemma-3-27b-it',                    label: 'Gemma 3 27B' },
    { id: 'google/gemma-3-9b-it',                     label: 'Gemma 3 9B' },
    // ── Microsoft ──
    { id: 'microsoft/phi-4',                          label: 'Phi 4' },
    { id: 'microsoft/phi-4-mini-instruct',            label: 'Phi 4 Mini' },
    // ── Otros ──
    { id: 'gpt-oss/gpt-oss-120b',                     label: 'GPT-OSS 120B' },
    { id: 'moonshotai/kimi-k2',                       label: 'Kimi K2' },
    { id: 'sarvam/sarvam-m',                          label: 'Sarvam-M (Indic languages)' },
  ],

  vision: [
    // Omni (texto + imagen + vídeo + audio)
    { id: 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning', label: 'Nemotron 3 Nano Omni 30B 🔮 (imagen/vídeo/audio/texto)' },
    // VLMs
    { id: 'nvidia/llama-3.1-nemotron-nano-vl-8b-v1',       label: 'Llama Nemotron Nano VL 8B (imagen+texto)' },
    { id: 'nvidia/nemotron-nano-12b-v2-vl',                 label: 'Nemotron Nano 12B VL (multi-imagen, vídeo)' },
    { id: 'meta/llama-4-scout-17b-16e-instruct',            label: 'Llama 4 Scout 17B (multimodal, 10M ctx)' },
    { id: 'meta/llama-4-maverick-17b-128e-instruct',        label: 'Llama 4 Maverick 17B (multimodal 128 MoE)' },
    { id: 'meta/llama-3.2-90b-vision-instruct',             label: 'Llama 3.2 90B Vision' },
    { id: 'meta/llama-3.2-11b-vision-instruct',             label: 'Llama 3.2 11B Vision' },
    { id: 'google/gemma-3-27b-it',                          label: 'Gemma 3 27B (imagen+texto)' },
    { id: 'nvidia/nemotron-parse',                          label: 'Nemotron Parse (OCR / extracción doc)' },
    { id: 'nvidia/nemoretriever-parse',                     label: 'NemoRetriever Parse (OCR doc)' },
  ],

  speech: [
    // ASR (reconocimiento de voz)
    { id: 'nvidia/parakeet-ctc-1.1b-asr',           label: 'Parakeet CTC 1.1B ASR (inglés, streaming)' },
    { id: 'nvidia/parakeet-rnnt-1.1b-multilingual',  label: 'Parakeet RNNT 1.1B ASR (multilingüe)' },
    { id: 'nvidia/canary-1b-asr',                    label: 'Canary 1B ASR (25 idiomas europeos)' },
    { id: 'nvidia/nemotron-speech-streaming',         label: 'Nemotron Speech Streaming (ultra-low latency)' },
    // TTS (síntesis de voz)
    { id: 'nvidia/magpie-tts-multilingual',           label: 'MagpieTTS Multilingual (9 idiomas, TTS)' },
  ],

  embeddings: [
    { id: 'nvidia/llama-nemotron-embed-1b-v2',        label: 'Llama Nemotron Embed 1B v2 (multilingual, 8192 tokens)' },
    { id: 'nvidia/llama-embed-nemotron-8b',           label: 'Llama Embed Nemotron 8B (MMTEB top)' },
    { id: 'nvidia/nv-embed-v2',                       label: 'NV-Embed v2' },
    { id: 'nvidia/llama-3.2-nv-embedqa-1b-v2',        label: 'NV EmbedQA 1B v2' },
    { id: 'nvidia/nvclip',                             label: 'NV-CLIP (imagen + texto, multimodal embed)' },
  ],
};

window.OLLAMA_DEFAULT_CATALOG = [
  // ── Chat general ──
  { id: 'llama3.3',            label: 'Llama 3.3 8B' },
  { id: 'llama3.3:70b',        label: 'Llama 3.3 70B' },
  { id: 'llama4-scout',        label: 'Llama 4 Scout (multimodal, 10M ctx)' },
  { id: 'qwen3:7b',            label: 'Qwen 3 7B' },
  { id: 'qwen3:30b',           label: 'Qwen 3 30B' },
  { id: 'qwen3.6:27b',         label: 'Qwen 3.6 27B (77.2% SWE-bench)' },
  { id: 'mistral',             label: 'Mistral 7B' },
  { id: 'mistral-small:24b',   label: 'Mistral Small 24B (function calling)' },
  { id: 'devstral-small:24b',  label: 'Devstral Small 24B (agentic coding)' },
  { id: 'phi4',                label: 'Phi 4' },
  { id: 'phi4-mini',           label: 'Phi 4 Mini' },
  // ── Razonamiento ──
  { id: 'deepseek-r1:7b',      label: 'DeepSeek R1 7B (razonamiento)' },
  { id: 'deepseek-r1:32b',     label: 'DeepSeek R1 32B (razonamiento)' },
  { id: 'gpt-oss:20b',         label: 'GPT-OSS 20B (razonamiento ajustable)' },
  // ── Coding ──
  { id: 'qwen2.5-coder:7b',    label: 'Qwen 2.5 Coder 7B' },
  { id: 'qwen2.5-coder:32b',   label: 'Qwen 2.5 Coder 32B (92.7% HumanEval)' },
  { id: 'kimi-k2.6',           label: 'Kimi K2.6 (SWE-Bench 58.6, MoE)' },
  // ── Visión ──
  { id: 'gemma4:e4b',          label: 'Gemma 4 4B (visión + tool calling)' },
  { id: 'gemma4:12b',          label: 'Gemma 4 12B (visión + OCR)' },
  { id: 'llava:13b',           label: 'LLaVA 13B (imagen+texto)' },
  // ── Embeddings locales ──
  { id: 'nomic-embed-text',    label: 'Nomic Embed Text (embeddings)' },
  { id: 'mxbai-embed-large',   label: 'MxBai Embed Large (embeddings)' },
  { id: 'all-minilm',          label: 'All MiniLM (embeddings, ligero)' },
];
