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

/**
 * URL the workbench iframe should load for a given project.
 *
 * If the project already has a bolt chat (workbenchChatId), resume it so an
 * iframe reload does not start a brand-new chat and regenerate the project.
 * Otherwise load the base page, optionally auto-submitting `prompt` for the
 * initial prompt handoff (WE-03).
 */
export function workbenchSrc(projectId: string, opts?: { prompt?: string; chatId?: string }) {
  if (opts?.chatId) {
    return `${WORKBENCH_ORIGIN}/chat/${encodeURIComponent(opts.chatId)}?a2ProjectId=${encodeURIComponent(projectId)}`;
  }

  const base = `${WORKBENCH_ORIGIN}/?a2ProjectId=${encodeURIComponent(projectId)}`;
  // bolt natively auto-submits a `prompt` URL param on load
  return opts?.prompt ? `${base}&prompt=${encodeURIComponent(opts.prompt)}` : base;
}
