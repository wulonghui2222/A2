import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "@/lib/prisma";
import { runPipeline } from "@/lib/pipeline";
import { findModel } from "@/lib/models";
import type { GenerateRequest, GenerateResponse } from "@/lib/types";
import type { LLMOptions } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 120; // Allow up to 2 minutes for generation

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequest;

    if (!body.prompt || body.prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Prompt is required", code: "MISSING_PROMPT" },
        { status: 400 }
      );
    }

    const prompt = body.prompt.trim();
    const projectId = uuidv4();
    const sessionId = body.sessionId || uuidv4();

    // Resolve LLM provider from model catalog
    const catalogModel = body.model ? findModel(body.model) : undefined;
    const llmOptions: LLMOptions = catalogModel
      ? { provider: catalogModel.provider, model: catalogModel.id }
      : body.model
        ? { model: body.model }
        : {};

    // Create project record
    const project = await prisma.project.create({
      data: {
        id: projectId,
        title: "Generating...",
        prompt,
        status: "generating",
      },
    });

    // Create or reuse session
    let session;
    if (body.sessionId) {
      session = await prisma.session.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        session = await prisma.session.create({
          data: { id: sessionId, projectId },
        });
      }
    } else {
      session = await prisma.session.create({
        data: { id: sessionId, projectId },
      });
    }

    // Run the pipeline in background (non-blocking)
    runPipeline(prompt, sessionId, projectId, (event) => {
      // Events are persisted via pipeline's saveMessage
      // For SSE, we'd stream here. For now, rely on polling.
      console.log(`[${event.stage}] progress: ${event.progress}%`);
    }, llmOptions).catch(async (error) => {
      console.error("Pipeline failed:", error);
      await prisma.project.update({
        where: { id: projectId },
        data: { status: "failed" },
      });
    });

    // Return immediately (client will poll for status)
    const response: GenerateResponse = {
      sessionId,
      projectId,
      status: "generating",
      messages: [],
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error("Generate API error:", error);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
