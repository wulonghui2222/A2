/*
 * A2 (design D5/D8, tasks 1.3/2.4): platform LLM defaults.
 * The client bundle cannot read server env, so the platform model and endpoint
 * are build-time constants; the credential stays server-side only
 * (.dev.vars -> BAILIAN_API_KEY, injected by the /api/llm gateway).
 */
export const A2_PLATFORM_PROVIDER = 'OpenAILike';
export const A2_DEFAULT_MODEL = 'glm-5.2';

/*
 * A2 (task 2.4): the workbench talks to the platform gateway, not to Bailian
 * directly. The OpenAI SDK appends /chat/completions and /models to this base.
 */
export const A2_LLM_BASE_URL = '/api/llm';

/*
 * Placeholder credential for the client-side SDK: the gateway discards whatever
 * Authorization header arrives and injects the real key server-side (LG-02).
 */
export const A2_CLIENT_KEY_PLACEHOLDER = 'a2-platform-key';

/*
 * A2 (design D6 / LG-04, tasks 6.1-6.3): UI feature switches. Flipping these to
 * true restores the upstream bolt.diy behavior; the underlying code is never
 * removed so upstream merges stay smooth.
 */
export const A2_ENABLE_BYOK = false; // Providers settings tab / API-key inputs
export const A2_ENABLE_PROVIDER_SWITCH = false; // provider selector in the chat UI
export const A2_ENABLE_CODE_CONNECTIONS = false; // GitHub connections tab / git push
export const A2_ENABLE_DEPLOY = false; // deploy exits (none exist in this fork yet)

/*
 * chat-response-stats (design D5): per-request status + timing stats in the
 * chat UI. Overridable via the A2_ENABLE_RESPONSE_STATS env var (set to
 * "false" to fall back to the pre-change behavior); defaults to on.
 */
export const A2_ENABLE_RESPONSE_STATS = (import.meta.env.A2_ENABLE_RESPONSE_STATS ?? 'true') !== 'false';

/*
 * add-generation-telemetry (design D6): generation pipeline telemetry. The
 * collection layer is always on (near-zero overhead); this flag only gates
 * the dev-only waterfall panel, which stays hidden from end users by default.
 */
export const A2_ENABLE_GENERATION_TELEMETRY = (import.meta.env.A2_ENABLE_GENERATION_TELEMETRY ?? 'false') !== 'false';

/*
 * replay-snapshot-cache (design D8): cache the installed workspace in OPFS so
 * replay can skip npm install. Defaults on; the localStorage key
 * "a2-nm-snapshot-cache" ("off"/"on") overrides it without a deploy.
 */
export const A2_ENABLE_NM_SNAPSHOT_CACHE = (import.meta.env.A2_ENABLE_NM_SNAPSHOT_CACHE ?? 'true') !== 'false';

/*
 * A2 perf: installs inside the WebContainer against the default npm registry
 * are slow on this network. Before an install command runs, the project's
 * .npmrc is pinned to this mirror (unless the project defines its own
 * registry). Set A2_NPM_REGISTRY_MIRROR="" to keep the default registry.
 */
export const A2_NPM_REGISTRY_MIRROR = import.meta.env.A2_NPM_REGISTRY_MIRROR ?? 'https://registry.npmmirror.com';

/*
 * add-multi-agent-team (design D6, task 1.1): multi-agent team mode
 * (TL + PD + Engineer). Defaults off; the env flag turns it on, and the
 * localStorage key "a2-multi-agent-mode" ("on"/"off") overrides the flag at
 * runtime so e2e can enable the feature on a shared dev server.
 */
const A2_MULTI_AGENT_ENV = (import.meta.env.A2_ENABLE_MULTI_AGENT_MODE ?? 'false') === 'true';

export const A2_ENABLE_MULTI_AGENT_MODE = A2_MULTI_AGENT_ENV;

export function isMultiAgentModeEnabled(): boolean {
  if (typeof localStorage !== 'undefined') {
    const override = localStorage.getItem('a2-multi-agent-mode');

    if (override === 'on') {
      return true;
    }

    if (override === 'off') {
      return false;
    }
  }

  return A2_MULTI_AGENT_ENV;
}
