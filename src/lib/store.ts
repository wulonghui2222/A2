"use client";

import { create } from "zustand";
import type { AgentMessage, ProjectStatus, StatusResponse } from "./types";

interface GenerationState {
  // Generation state
  isGenerating: boolean;
  sessionId: string | null;
  projectId: string | null;
  status: ProjectStatus;
  progress: number;
  messages: AgentMessage[];
  error: string | null;

  // Actions
  startGeneration: (prompt: string, model?: string) => Promise<void>;
  pollStatus: () => Promise<void>;
  reset: () => void;
}

export const useGenerationStore = create<GenerationState>((set, get) => ({
  isGenerating: false,
  sessionId: null,
  projectId: null,
  status: "generating",
  progress: 0,
  messages: [],
  error: null,

  startGeneration: async (prompt: string, model?: string) => {
    set({
      isGenerating: true,
      status: "generating",
      progress: 0,
      messages: [],
      error: null,
      sessionId: null,
      projectId: null,
    });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, model }),
      });

      if (!response.ok) {
        const data = await response.json();
        // Redirect to login when session expired / not logged in
        if (response.status === 401) {
          window.location.href = "/login?callbackUrl=/";
          return;
        }
        throw new Error(data.error || "Generation failed");
      }

      const data = await response.json();
      set({
        sessionId: data.sessionId,
        projectId: data.projectId,
      });

      // Start polling
      get().pollStatus();
    } catch (error) {
      set({
        isGenerating: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },

  pollStatus: async () => {
    const { sessionId, isGenerating } = get();
    if (!sessionId || !isGenerating) return;

    try {
      const response = await fetch(`/api/generate/${sessionId}/status`);
      if (!response.ok) return;

      const data: StatusResponse = await response.json();

      set({
        status: data.status,
        progress: data.progress,
        messages: data.messages,
      });

      if (data.status === "completed" || data.status === "failed") {
        set({ isGenerating: false });
      } else {
        // Continue polling after 2 seconds
        setTimeout(() => get().pollStatus(), 2000);
      }
    } catch {
      // Retry polling on error
      setTimeout(() => get().pollStatus(), 3000);
    }
  },

  reset: () => {
    set({
      isGenerating: false,
      sessionId: null,
      projectId: null,
      status: "generating",
      progress: 0,
      messages: [],
      error: null,
    });
  },
}));
