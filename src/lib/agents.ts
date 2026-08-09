import { callLLM, extractJSON, extractHTML, type LLMOptions } from "./llm";
import type { RequirementSpec, ArchitecturePlan } from "./types";

// ─── Agent System Prompts ──────────────────────────────────────

const PM_SYSTEM_PROMPT = `You are a Product Manager Agent. Your task is to analyze the user's natural language requirement and produce a structured requirement specification.

Output ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "title": "App title (concise, 3-6 words)",
  "description": "One-sentence description of the app",
  "pages": [
    {"name": "Page name", "elements": ["Element 1", "Element 2"]}
  ],
  "features": ["Feature 1", "Feature 2"],
  "dataModels": [
    {"name": "Model name", "fields": [{"name": "field name", "type": "string|number|boolean"}]}
  ]
}`;

const ARCHITECT_SYSTEM_PROMPT = `You are a System Architect Agent. Based on the requirement specification, design the page structure and technical plan for a single-file HTML web application.

Output ONLY a valid JSON object in this exact format (no markdown, no explanation):
{
  "layout": "Description of the page layout structure",
  "components": ["Component 1", "Component 2", "Component 3"],
  "styles": "Description of the visual style (colors, typography, spacing)",
  "interactions": ["Interaction 1", "Interaction 2"]
}`;

const ENGINEER_SYSTEM_PROMPT = `You are a Full-Stack Engineer Agent. Based on the architecture plan, generate a complete single-file HTML application with inline CSS and JavaScript.

Requirements:
1. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
2. Include real interactions (forms, buttons, navigation, modals)
3. Use localStorage for data persistence
4. Responsive design (mobile-friendly)
5. Modern UI style with clean aesthetics
6. Output ONLY the complete HTML code, starting with <!DOCTYPE html> and ending with </html>
7. Do NOT wrap in markdown code blocks. Output raw HTML only.`;

// ─── PM Agent ──────────────────────────────────────────────────
export async function runPMAgent(
  userPrompt: string,
  options?: LLMOptions
): Promise<RequirementSpec> {
  const response = await callLLM(PM_SYSTEM_PROMPT, userPrompt, {
    ...options,
    maxTokens: 2048,
    temperature: 0.5,
  });

  const spec = extractJSON<RequirementSpec>(response.content);
  if (!spec || !spec.title) {
    // Fallback: create a basic spec from the prompt
    return {
      title: userPrompt.slice(0, 50) || "Generated App",
      description: userPrompt,
      pages: [{ name: "Main", elements: ["Header", "Content", "Footer"] }],
      features: ["Basic functionality"],
      dataModels: [],
    };
  }
  return spec;
}

// ─── Architect Agent ───────────────────────────────────────────
export async function runArchitectAgent(
  requirementSpec: RequirementSpec,
  options?: LLMOptions
): Promise<ArchitecturePlan> {
  const response = await callLLM(
    ARCHITECT_SYSTEM_PROMPT,
    JSON.stringify(requirementSpec),
    { ...options, maxTokens: 2048, temperature: 0.5 }
  );

  const plan = extractJSON<ArchitecturePlan>(response.content);
  if (!plan || !plan.layout) {
    return {
      layout: "Single page with header, main content area, and footer",
      components: ["Header", "Main Content", "Footer"],
      styles: "Modern, clean design with Tailwind CSS",
      interactions: ["Button clicks", "Form submissions"],
    };
  }
  return plan;
}

// ─── Engineer Agent ────────────────────────────────────────────
export async function runEngineerAgent(
  requirementSpec: RequirementSpec,
  architecturePlan: ArchitecturePlan,
  options?: LLMOptions
): Promise<string> {
  const context = JSON.stringify({
    requirement: requirementSpec,
    architecture: architecturePlan,
  });

  const response = await callLLM(ENGINEER_SYSTEM_PROMPT, context, {
    ...options,
    maxTokens: 8192,
    temperature: 0.3,
  });

  return extractHTML(response.content);
}
