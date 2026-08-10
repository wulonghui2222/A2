import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client"],
  devIndicators: {
    appIsrStatus: false,
    buildActivity: false,
  },
  // Route-scoped cross-origin isolation (design D2, spike C1): only the
  // workbench embed route carries COEP/COOP — site-wide isolation would
  // break any page loading non-CORP cross-origin resources.
  async headers() {
    return [
      {
        source: "/workbench/:projectId",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
