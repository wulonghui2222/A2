import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";

// Title bounds (mirror /api/projects/[id] PATCH validation)
const TITLE_MAX = 120;

/**
 * POST /api/projects — create a project shell before opening the workbench.
 * Generation itself runs inside the embedded bolt workbench (client-side);
 * this record is the persistence anchor. See bolt-rewrite FR-01 / D5.
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

    let body: { prompt?: string; title?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "无效的请求体", code: "INVALID_BODY" },
        { status: 400 }
      );
    }

    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required", code: "MISSING_PROMPT" },
        { status: 400 }
      );
    }

    const title = (
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim()
        : prompt
    ).slice(0, TITLE_MAX);

    const project = await prisma.project.create({
      data: {
        id: uuidv4(),
        title,
        prompt,
        status: "generating",
        userId,
      },
      select: { id: true, status: true },
    });

    return NextResponse.json({ projectId: project.id, status: project.status });
  } catch (error) {
    console.error("Projects API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
