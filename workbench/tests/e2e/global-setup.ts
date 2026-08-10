/*
 * A2 test-suite (TS-02): warm the dev server before the suite starts.
 * Vite compiles on demand; requesting the main pages up front moves the cold
 * module-graph compile out of the timed test bodies, which otherwise contend
 * when several workers hit a freshly started server at once.
 */
export default async function globalSetup() {
  const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
  const warmPaths = ['/', '/login', '/register'];

  for (const path of warmPaths) {
    try {
      await fetch(`${baseURL}${path}`, { signal: AbortSignal.timeout(60_000) });
    } catch {
      // webServer readiness is checked by Playwright itself; keep warming
      // best-effort so a transient hiccup doesn't abort the whole suite.
    }
  }
}
