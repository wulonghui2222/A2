## Why

A2's generation core today is a server-side PM → Architect → Engineer pipeline that emits a **single HTML string**. This ceiling is now visible from every angle: no multi-file projects, no dependencies, no dev server, iteration quality bounded by one-shot prompting, and the chat ⇄ preview loop we just delivered can never grow past "replace the whole HTML".

bolt.diy is a proven open-source Vibe Coding workbench (chat → artifacts → WebContainer live preview → real multi-file projects with npm/build). Per the explore session's **Shape B** decision, A2 steps back to **portal + API** (home, gallery, my-projects, auth, persistence) while a bolt fork becomes the **generation workbench**, embedded as a cross-origin iframe at `/workbench/:projectId`.

The prerequisite spike passed 3/3 (`doc/spike-bolt-embed.md`): WebContainer boots under embedded cross-origin-isolated delegation; build + dist export works via `webcontainer.export()`; the token/postMessage handshake round-trips with origin validation. It also surfaced four hard constraints (route-scoped COEP on the parent, CORP on the bolt response, stackblitz.com reachability, dev-env postcss trap) that this change's design must encode.

The explore session also settled: **multi-agent orchestration is abandoned** (option a) — bolt is a single-conversation flow and bolting a PM/Architect layer onto it costs more than it returns.

## What Changes

**New capability: `workbench-embed`**

- A2 route `/workbench/:projectId` renders the bolt fork in an iframe (`allow="cross-origin-isolated"`); the route alone carries `COEP: require-corp` + `COOP: same-origin` (never site-wide — isolation breaks any page with non-CORP cross-origin resources)
- Seam protocol over postMessage, both sides validating `origin` and a one-time token issued by A2:
  - **handshake** (A2 → bolt): auth token + project context (initial prompt for new projects)
  - **artifact** (bolt → A2): exported dist file tree on save/publish events
- Ownership enforced server-side: workbench page and token issuance 404 for non-owners, matching `/projects/:id` semantics

**`app-core` rewired around the workbench**

- **FR-01**: home-page prompt creates the Project record, then navigates to the workbench; generation itself runs inside bolt (client-side, WebContainer). Server generation pipeline is retired
- **FR-02**: **REMOVED** — multi-agent orchestration abandoned
- **FR-03**: live preview during generation is bolt's own WebContainer preview; the project detail preview keeps rendering the **persisted artifact** (sandboxed iframe, existing toolbar)
- **FR-04**: persistence adapts from single-HTML to artifact file tree: new `Project.files` (JSON file tree from `export()`); `Project.code` keeps the flattened entry (`dist/index.html`) so gallery/detail preview and the existing public-toggle flow work unchanged
- **FR-08**: iteration is bolt's native chat loop inside the workbench; the A2-side iteration turn (`runIterationPipeline`, dispatch branch) is retired

**Retired code**

- `src/lib/agents.ts`, `src/lib/pipeline.ts`, the generate/iteration dispatch in `POST /api/generate`, `AgentMessages`, home-page chat composer flow, iteration store state

## Non-Goals

- **LLM key architecture upgrade**: bolt keeps its browser-side provider settings (OpenAI-like endpoint + key in bolt UI). Proxying bolt's LLM traffic through A2 (to honor NFR-03's "keys server-side only") is explicitly deferred — recorded as a risk, not silently accepted
- **Deploying the bolt fork**: fork lives in-repo (directory renamed `spike-bolt` → `workbench`); its production hosting (Remix/Cloudflare Pages vs A2's Vercel, per NFR-04) is a separate change. This change only adds `WORKBENCH_ORIGIN` env wiring
- **Restoring multi-agent orchestration** in any form
- **Gallery Remix / template prefill into the workbench** — seam supports initial prompt; template wiring deferred
- **Code versioning / rollback**, streaming, mobile workbench polish
- Rewriting bolt UI copy/branding (spike keeps bolt defaults; localization is separate)

## Capabilities

### New Capabilities

- `workbench-embed`: workbench route, cross-origin isolation contract, seam protocol (handshake / prompt handoff / artifact export), token issuance and ownership enforcement

### Modified Capabilities

- `app-core`: FR-01 (workbench-based generation), FR-03 (preview split: live-in-workbench vs persisted-artifact), FR-04 (file-tree persistence), FR-08 (iteration inside workbench); FR-02 removed

## Impact

- **Routes**: new `/workbench/[projectId]` (COEP/COOP via `next.config.ts` headers, migrated from the spike page); home page generation flow replaced by "create project → open workbench"
- **Schema**: `Project.files` column (JSON string); `code` retained as flattened entry artifact
- **API**: new `POST /api/workbench/token` (one-time token, owner-only); `POST /api/workbench/artifact` (receive dist tree, owner-only); `POST /api/generate` retired
- **Removed**: `agents.ts`, `pipeline.ts`, generate routes, `AgentMessages`, `ChatComposer` usage on home/detail, iteration store state
- **Env**: `WORKBENCH_ORIGIN` (dev `http://localhost:5173`)
- **Repo**: `spike-bolt/` renamed to `workbench/`; spike-only bridge code in `app/root.tsx` promoted to the fork's real seam layer
- **Specs**: delta adds `workbench-embed`, modifies app-core FR-01/03/04/08, removes FR-02
