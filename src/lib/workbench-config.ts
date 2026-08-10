/**
 * Workbench (bolt fork) integration config.
 *
 * The workbench runs as a separate app (dev: `pnpm dev` in `workbench/`,
 * port 5173) and is embedded as a cross-origin iframe on /workbench/:id.
 * `WORKBENCH_ORIGIN` is the single source of truth for where it lives.
 */

/** Origin of the workbench app, e.g. http://localhost:5173. */
export const WORKBENCH_ORIGIN = process.env.WORKBENCH_ORIGIN ?? "http://localhost:5173";

/** Origin whitelist used when validating seam messages from the workbench. */
export const WORKBENCH_ORIGINS = [WORKBENCH_ORIGIN];

/** URL the workbench iframe should load for a given project. */
export function workbenchSrc(projectId: string, prompt?: string) {
  const base = `${WORKBENCH_ORIGIN}/?a2ProjectId=${encodeURIComponent(projectId)}`;
  // bolt natively auto-submits a `prompt` URL param on load — used for the
  // initial prompt handoff (WE-03) with zero fork-side chat wiring.
  return prompt ? `${base}&prompt=${encodeURIComponent(prompt)}` : base;
}
