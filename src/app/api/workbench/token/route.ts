import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";

/** One-time workbench token validity window (design D3). */
const TOKEN_TTL_MS = 5 * 60 * 1000;

async function resolveOwnedProject(projectId: string, userId: string | undefined) {
  if (!userId) return { status: 401 as const, code: "UNAUTHORIZED" as const, error: "请先登录" };
  if (!projectId) return { status: 400 as const, code: "MISSING_PROJECT_ID" as const, error: "projectId 必填" };
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  // Hide existence from non-owners, matching /projects/:id semantics
  if (!project || project.userId !== userId) {
    return { status: 404 as const, code: "NOT_FOUND" as const, error: "项目不存在" };
  }
  return { project };
}

/**
 * POST /api/workbench/token — issue a one-time seam token for the workbench
 * iframe (owner-only, 5 minute TTL). Re-issuing invalidates prior tokens.
 */
export async function POST(request: NextRequest) {
  try {
    const userSession = await auth();
    let body: { projectId?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "无效的请求体", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const owner = await resolveOwnedProject(body.projectId ?? "", userSession?.user?.id);
    if ("status" in owner) {
      return NextResponse.json({ error: owner.error, code: owner.code }, { status: owner.status });
    }

    // Invalidate any outstanding tokens for this project (one live token at a time)
    await prisma.workbenchToken.deleteMany({ where: { projectId: owner.project.id } });

    const token = await prisma.workbenchToken.create({
      data: {
        token: randomUUID(),
        projectId: owner.project.id,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      },
    });

    return NextResponse.json({ token: token.token, expiresAt: token.expiresAt.toISOString() });
  } catch (error) {
    console.error("Workbench token API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
