/**
 * Jump from the project detail page to the workbench (bolt fork iframe) for
 * this project. Plain anchor on purpose: /workbench/:id alone carries the
 * COEP/COOP headers the WebContainer needs, and those only apply on a full
 * document load — client-side navigation would skip them.
 */
export function OpenWorkbenchButton({
  projectId,
  label,
  compact = false,
}: {
  projectId: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <a
      href={`/workbench/${projectId}`}
      className={
        compact
          ? "px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          : "px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
      }
    >
      {label}
    </a>
  );
}
