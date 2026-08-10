import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";

interface ChatMessage {
  id?: string;
  role: string;
  content: string;
  timestamp?: string;
}

interface ChatHistoryRequest {
  projectId?: string;
  token?: string;
  urlId?: string;
  messages?: ChatMessage[];
}

/**
 * POST /api/workbench/chat-history — mirror the bolt fork chat history into
 * A2's Session / AgentMessage tables so the project detail page can display
 * the conversation (WE-07). Owner-only; the one-time seam token is redeemed
 * server-side, mirroring the artifact / chat-url routes. Replace strategy:
 * all existing messages for the project's session are deleted, then the new
 * batch is created in a single transaction.
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

    let body: ChatHistoryRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "无效的请求体", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const { projectId, token, urlId, messages } = body;
    if (!projectId || !token || !messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "projectId / token / messages 必填", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    // R1: cap payload size (≤ 200 messages)
    if (messages.length > 200) {
      return NextResponse.json(
        { error: "消息数超出限制（≤ 200）", code: "PAYLOAD_TOO_LARGE" },
        { status: 413 }
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

    // Find or create the session for this project (one Session per project)
    let session = await prisma.session.findFirst({ where: { projectId } });
    if (!session) {
      session = await prisma.session.create({ data: { projectId } });
    }

    const savedAt = new Date();
    await prisma.$transaction([
      // Replace strategy (design D3): delete all existing messages, then
      // create the new batch in a single transaction. The replace
      // strategy is already idempotent — no skipDuplicates needed.
      prisma.agentMessage.deleteMany({ where: { sessionId: session.id } }),
      prisma.agentMessage.createMany({
        data: messages.map((m) => ({
          sessionId: session!.id,
          agentRole: m.role,
          content: m.content,
          type: "text",
        })),
      }),
      prisma.workbenchToken.update({
        where: { id: seamToken!.id },
        data: { consumedAt: savedAt },
      }),
    ]);

    // If the chat-history includes a urlId and the project doesn't have
    // one yet, persist it as a fallback (chat-url route handles the normal case).
    if (urlId && project.workbenchChatId !== urlId) {
      await prisma.project.update({
        where: { id: project.id },
        data: { workbenchChatId: urlId },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Workbench chat-history API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
