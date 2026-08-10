// A2 (design D5/D8, tasks 1.3/2.4): platform LLM defaults.
// The client bundle cannot read server env, so the platform model and endpoint
// are build-time constants; the credential stays server-side only
// (.dev.vars -> BAILIAN_API_KEY, injected by the /api/llm gateway).
export const A2_PLATFORM_PROVIDER = 'OpenAILike';
export const A2_DEFAULT_MODEL = 'qwen3.8-max';

// A2 (task 2.4): the workbench talks to the platform gateway, not to Bailian
// directly. The OpenAI SDK appends /chat/completions and /models to this base.
export const A2_LLM_BASE_URL = '/api/llm';

// Placeholder credential for the client-side SDK: the gateway discards whatever
// Authorization header arrives and injects the real key server-side (LG-02).
export const A2_CLIENT_KEY_PLACEHOLDER = 'a2-platform-key';

// A2 (design D6 / LG-04, tasks 6.1-6.3): UI feature switches. Flipping these to
// true restores the upstream bolt.diy behavior; the underlying code is never
// removed so upstream merges stay smooth.
export const A2_ENABLE_BYOK = false; // Providers settings tab / API-key inputs
export const A2_ENABLE_PROVIDER_SWITCH = false; // provider selector in the chat UI
export const A2_ENABLE_CODE_CONNECTIONS = false; // GitHub connections tab / git push
export const A2_ENABLE_DEPLOY = false; // deploy exits (none exist in this fork yet)
