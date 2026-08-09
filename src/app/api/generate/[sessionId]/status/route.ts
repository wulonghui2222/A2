import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { StatusResponse, AgentMessage } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        project: true,
        messages: {
          orderBy: { timestamp: "asc" },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { error: "Session not found", code: "SESSION_NOT_FOUND" },
        { status: 404 }
      );
    }

    const messages: AgentMessage[] = session.messages.map((msg) => ({
      id: msg.id,
      sessionId: msg.sessionId,
      agentRole: msg.agentRole as AgentMessage["agentRole"],
      content: msg.content,
      type: msg.type as AgentMessage["type"],
      timestamp: msg.timestamp.toISOString(),
      metadata: msg.metadata ? JSON.parse(msg.metadata) : undefined,
    }));

    // Calculate progress based on message count and project status
    const progress = calculateProgress(session.project.status, messages.length);

    const response: StatusResponse = {
      status: session.project.status as StatusResponse["status"],
      progress,
      messages,
      previewUrl:
        session.project.status === "completed"
          ? `/projects/${session.project.id}`
          : undefined,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Status API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

function calculateProgress(status: string, messageCount: number): number {
  if (status === "completed") return 100;
  if (status === "failed") return 0;

  // Estimate progress from message count
  // Typical flow: ~8-10 messages from start to finish
  const estimated = Math.min(messageCount * 12, 90);
  return estimated;
}
