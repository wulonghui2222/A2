import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** Upper bound for the serialized artifact tree (guard against runaway saves). */
const MAX_FILES_JSON_BYTES = 8 * 1024 * 1024;

interface ArtifactRequest {
  projectId?: string;
  token?: string;
  files?: unknown;
}

/** Walk a WebContainer FileSystemTree JSON export for the dist entry file. */
function extractEntryHtml(files: Record<string, unknown>): string | null {
  const entry = files?.["index.html"] as { file?: { contents?: unknown } } | undefined;
  return typeof entry?.file?.contents === "string" ? entry.file.contents : null;
}

/**
 * POST /api/workbench/artifact — persist the dist file tree exported by the
 * workbench (Save to A2). Owner-only; the one-time seam token is redeemed
 * server-side — the postMessage channel itself carries no write trust.
 */
export async function POST(request: NextRequest) {
  try {
    const userSession = await auth();
    if (!userSession?.user?.id) {
      return NextResponse.json(
        { error: "请先登录", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const userId = userSession.user.id;

    let body: ArtifactRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "无效的请求体", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const { projectId, token, files } = body;
    if (!projectId || !token || typeof files !== "object" || files === null) {
      return NextResponse.json(
        { error: "projectId / token / files 必填", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const filesJson = JSON.stringify(files);
    if (filesJson.length > MAX_FILES_JSON_BYTES) {
      return NextResponse.json(
        { error: "产物体积超出限制", code: "ARTIFACT_TOO_LARGE" },
        { status: 413 }
      );
    }

    // Redeem the one-time token (project + owner scoped)
    const seamToken = await prisma.workbenchToken.findUnique({ where: { token } });
    const valid =
      seamToken &&
      seamToken.projectId === projectId &&
      !seamToken.consumedAt &&
      seamToken.expiresAt.getTime() > Date.now();
    if (!valid) {
      return NextResponse.json(
        { error: "令牌无效或已过期", code: "INVALID_TOKEN" },
        { status: 403 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    // Hide existence from non-owners, matching /projects/:id semantics
    if (!project || project.userId !== userId) {
      return NextResponse.json(
        { error: "项目不存在", code: "NOT_FOUND" },
        { status: 404 }
      );
    }

    const entryHtml = extractEntryHtml(files as Record<string, unknown>);

    const savedAt = new Date();
    await prisma.$transaction([
      prisma.project.update({
        where: { id: project.id },
        data: {
          files: filesJson,
          // Keep the flattened entry so gallery/detail previews and the
          // public-toggle flow keep working unchanged (design D4).
          code: entryHtml ?? "",
          status: "completed",
          updatedAt: savedAt,
        },
      }),
      prisma.workbenchToken.update({
        where: { id: seamToken!.id },
        data: { consumedAt: savedAt },
      }),
    ]);

    return NextResponse.json({ ok: true, savedAt: savedAt.toISOString() });
  } catch (error) {
    console.error("Workbench artifact API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
