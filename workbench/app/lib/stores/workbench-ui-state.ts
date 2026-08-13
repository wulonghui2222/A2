import { atom, type WritableAtom } from 'nanostores';

/**
 * Standalone UI state atom for workbench visibility.
 *
 * Kept in a separate module (no Node.js builtins) so that components like
 * BaseChat.tsx can subscribe to workbench visibility without pulling in the
 * heavy workbenchStore dependency chain (which transitively imports
 * node:path → path-browserify, crashing in the browser with "module is not
 * defined").
 */
export const showWorkbench: WritableAtom<boolean> =
  import.meta.hot?.data.__showWorkbench ?? atom(false);

if (import.meta.hot) {
  import.meta.hot.data.__showWorkbench = showWorkbench;
}
