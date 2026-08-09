// ─── Agent Roles ───────────────────────────────────────────────
export type AgentRole = "pm" | "architect" | "engineer" | "system" | "user";
export type MessageType = "text" | "plan" | "code" | "error";
export type ProjectStatus = "generating" | "completed" | "failed";
export type SessionStatus = "active" | "completed" | "archived";

// ─── Agent Message ─────────────────────────────────────────────
export interface AgentMessage {
  id: string;
  sessionId: string;
  agentRole: AgentRole;
  content: string;
  type: MessageType;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Project ───────────────────────────────────────────────────
export interface Project {
  id: string;
  title: string;
  description: string;
  prompt: string;
  code: string;
  status: ProjectStatus;
  isPublic: boolean;
  viewCount: number;
  tags: string[];
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Session ───────────────────────────────────────────────────
export interface Session {
  id: string;
  projectId: string;
  status: SessionStatus;
  createdAt: string;
  messages: AgentMessage[];
}

// ─── PM Agent Output ───────────────────────────────────────────
export interface RequirementSpec {
  title: string;
  description: string;
  pages: Array<{
    name: string;
    elements: string[];
  }>;
  features: string[];
  dataModels: Array<{
    name: string;
    fields: Array<{ name: string; type: string }>;
  }>;
}

// ─── Architect Agent Output ────────────────────────────────────
export interface ArchitecturePlan {
  layout: string;
  components: string[];
  styles: string;
  interactions: string[];
}

// ─── Generate API ──────────────────────────────────────────────
export interface GenerateRequest {
  prompt: string;
  sessionId?: string;
  model?: string;
}

export interface GenerateResponse {
  sessionId: string;
  projectId: string;
  status: ProjectStatus;
  previewUrl?: string;
  messages: AgentMessage[];
}

export interface StatusResponse {
  status: ProjectStatus;
  progress: number; // 0-100
  messages: AgentMessage[];
  previewUrl?: string;
}

// ─── Pipeline State (for SSE) ──────────────────────────────────
export type PipelineStage =
  | "pm_analyzing"
  | "pm_completed"
  | "architect_designing"
  | "architect_completed"
  | "engineer_coding"
  | "engineer_completed"
  | "saving"
  | "completed"
  | "failed";

export interface PipelineEvent {
  stage: PipelineStage;
  message: AgentMessage;
  progress: number;
}
