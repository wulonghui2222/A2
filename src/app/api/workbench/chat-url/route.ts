import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";

interface ChatUrlRequest {
  projectId?: string;
  token?: string;
  urlId?: string;
}

/**
 * POST /api/workbench/chat-url — persist the bolt fork chat urlId so later
 * reloads of /workbench/:projectId resume the same chat instead of starting
 * a brand-new one (which would regenerate the project). Owner-only; the
 * one-time seam token is redeemed server-side, mirroring the artifact route.
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

    let body: ChatUrlRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "无效的请求体", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const { projectId, token, urlId } = body;
    if (!projectId || !token || !urlId || typeof urlId !== "string") {
      return NextResponse.json(
        { error: "projectId / token / urlId 必填", code: "INVALID_BODY" },
        { status: 400 }
      );
    }
    if (urlId.length > 256) {
      return NextResponse.json(
        { error: "urlId 超出限制", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    // Redeem the one-time token (project-scoped)
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

    const savedAt = new Date();
    await prisma.$transaction([
      prisma.project.update({
        where: { id: project.id },
        data: { workbenchChatId: urlId },
      }),
      prisma.workbenchToken.update({
        where: { id: seamToken!.id },
        data: { consumedAt: savedAt },
      }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Workbench chat-url API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
