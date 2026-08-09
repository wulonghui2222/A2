import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

export const runtime = "nodejs";

// Title bounds
const TITLE_MIN = 1;
const TITLE_MAX = 120;

type RouteContext = { params: Promise<{ id: string }> };

async function resolveOwner(id: string, userId: string | undefined) {
  if (!userId) return { status: 401 as const, code: "UNAUTHORIZED" as const, error: "请先登录" };
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return { status: 404 as const, code: "NOT_FOUND" as const, error: "项目不存在" };
  if (project.userId !== userId) {
    // Hide existence from non-owners
    return { status: 404 as const, code: "NOT_FOUND" as const, error: "项目不存在" };
  }
  return { project };
}

export async function DELETE(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;
  const session = await auth();
  const owner = await resolveOwner(id, session?.user?.id);
  if ("status" in owner) {
    return NextResponse.json({ error: owner.error, code: owner.code }, { status: owner.status });
  }

  // Session + AgentMessage cascade via onDelete: Cascade in schema
  await prisma.project.delete({ where: { id: owner.project.id } });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;
  const session = await auth();
  const owner = await resolveOwner(id, session?.user?.id);
  if ("status" in owner) {
    return NextResponse.json({ error: owner.error, code: owner.code }, { status: owner.status });
  }

  let body: { title?: string; isPublic?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "无效的请求体", code: "INVALID_BODY" },
      { status: 400 }
    );
  }

  const data: { title?: string; isPublic?: boolean } = {};

  // Validate title if provided
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : undefined;
    if (title === undefined || title.length < TITLE_MIN || title.length > TITLE_MAX) {
      return NextResponse.json(
        { error: `标题长度需在 ${TITLE_MIN}-${TITLE_MAX} 个字符之间`, code: "INVALID_TITLE" },
        { status: 400 }
      );
    }
    data.title = title;
  }

  // Validate isPublic if provided
  if (body.isPublic !== undefined) {
    if (typeof body.isPublic !== "boolean") {
      return NextResponse.json(
        { error: "isPublic 必须是布尔值", code: "INVALID_IS_PUBLIC" },
        { status: 400 }
      );
    }
    if (body.isPublic === true && owner.project.status !== "completed") {
      return NextResponse.json(
        { error: "仅已完成的项目可以公开", code: "CANNOT_PUBLISH_INCOMPLETE" },
        { status: 400 }
      );
    }
    data.isPublic = body.isPublic;
  }

  // Must have at least one field to update
  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "请提供 title 或 isPublic 字段", code: "NO_FIELDS" },
      { status: 400 }
    );
  }

  const updated = await prisma.project.update({
    where: { id: owner.project.id },
    data,
    select: { id: true, title: true, isPublic: true, updatedAt: true },
  });

  return NextResponse.json(updated);
}
