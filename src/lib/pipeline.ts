import { v4 as uuidv4 } from "uuid";
import { prisma } from "./prisma";
import { runPMAgent, runArchitectAgent, runEngineerAgent } from "./agents";
import type {
  AgentMessage,
  PipelineEvent,
  RequirementSpec,
  ArchitecturePlan,
} from "./types";
import type { LLMOptions } from "./llm";

type EventCallback = (event: PipelineEvent) => void;

function createMessage(
  sessionId: string,
  agentRole: string,
  content: string,
  type: string = "text",
  metadata?: Record<string, unknown>
): AgentMessage {
  return {
    id: uuidv4(),
    sessionId,
    agentRole: agentRole as AgentMessage["agentRole"],
    content,
    type: type as AgentMessage["type"],
    timestamp: new Date().toISOString(),
    metadata,
  };
}

export async function runPipeline(
  prompt: string,
  sessionId: string,
  projectId: string,
  onEvent: EventCallback,
  options?: LLMOptions
): Promise<string> {
  // ─── Stage 1: PM Agent ───────────────────────────────────────
  const pmStartMsg = createMessage(sessionId, "pm", "正在分析你的需求...");
  onEvent({ stage: "pm_analyzing", message: pmStartMsg, progress: 10 });
  await saveMessage(sessionId, pmStartMsg);

  let requirementSpec: RequirementSpec;
  try {
    requirementSpec = await runPMAgent(prompt, options);
  } catch (error) {
    const errMsg = createMessage(
      sessionId, "pm",
      `需求分析失败: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error"
    );
    onEvent({ stage: "failed", message: errMsg, progress: 0 });
    await saveMessage(sessionId, errMsg);
    throw error;
  }

  const pmDoneMsg = createMessage(
    sessionId, "pm",
    `需求分析完成！\n\n**${requirementSpec.title}**\n${requirementSpec.description}\n\n功能特性：${requirementSpec.features.join("、")}`,
    "plan",
    { plan: requirementSpec }
  );
  onEvent({ stage: "pm_completed", message: pmDoneMsg, progress: 30 });
  await saveMessage(sessionId, pmDoneMsg);

  // ─── Stage 2: Architect Agent ────────────────────────────────
  const archStartMsg = createMessage(sessionId, "architect", "正在设计页面结构和技术方案...");
  onEvent({ stage: "architect_designing", message: archStartMsg, progress: 40 });
  await saveMessage(sessionId, archStartMsg);

  let architecturePlan: ArchitecturePlan;
  try {
    architecturePlan = await runArchitectAgent(requirementSpec, options);
  } catch (error) {
    const errMsg = createMessage(
      sessionId, "architect",
      `架构设计失败: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error"
    );
    onEvent({ stage: "failed", message: errMsg, progress: 0 });
    await saveMessage(sessionId, errMsg);
    throw error;
  }

  const archDoneMsg = createMessage(
    sessionId, "architect",
    `架构设计完成！\n\n布局：${architecturePlan.layout}\n组件：${architecturePlan.components.join("、")}\n交互：${architecturePlan.interactions.join("、")}`,
    "plan",
    { architecture: architecturePlan }
  );
  onEvent({ stage: "architect_completed", message: archDoneMsg, progress: 60 });
  await saveMessage(sessionId, archDoneMsg);

  // ─── Stage 3: Engineer Agent ─────────────────────────────────
  const engStartMsg = createMessage(sessionId, "engineer", "正在生成应用代码...");
  onEvent({ stage: "engineer_coding", message: engStartMsg, progress: 70 });
  await saveMessage(sessionId, engStartMsg);

  let code: string;
  try {
    code = await runEngineerAgent(requirementSpec, architecturePlan, options);
  } catch (error) {
    const errMsg = createMessage(
      sessionId, "engineer",
      `代码生成失败: ${error instanceof Error ? error.message : "Unknown error"}`,
      "error"
    );
    onEvent({ stage: "failed", message: errMsg, progress: 0 });
    await saveMessage(sessionId, errMsg);
    throw error;
  }

  const engDoneMsg = createMessage(
    sessionId, "engineer",
    "代码生成完成！正在保存项目...",
    "code",
    { code: code.slice(0, 200) + "..." }
  );
  onEvent({ stage: "engineer_completed", message: engDoneMsg, progress: 85 });
  await saveMessage(sessionId, engDoneMsg);

  // ─── Stage 4: Save Project ───────────────────────────────────
  onEvent({
    stage: "saving",
    message: createMessage(sessionId, "system", "正在保存项目..."),
    progress: 90,
  });

  await prisma.project.update({
    where: { id: projectId },
    data: {
      title: requirementSpec.title,
      description: requirementSpec.description,
      code,
      status: "completed",
    },
  });

  const doneMsg = createMessage(
    sessionId, "system",
    "项目已保存！你可以在预览区域查看生成的应用。"
  );
  onEvent({ stage: "completed", message: doneMsg, progress: 100 });
  await saveMessage(sessionId, doneMsg);

  // Mark session as completed
  await prisma.session.update({
    where: { id: sessionId },
    data: { status: "completed" },
  });

  return code;
}

async function saveMessage(sessionId: string, message: AgentMessage) {
  await prisma.agentMessage.create({
    data: {
      id: message.id,
      sessionId,
      agentRole: message.agentRole,
      content: message.content,
      type: message.type,
      metadata: message.metadata ? JSON.stringify(message.metadata) : null,
    },
  });
}
