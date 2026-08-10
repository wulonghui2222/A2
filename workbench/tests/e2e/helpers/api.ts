import type { APIRequestContext } from '@playwright/test';

/*
 * A2 test-suite (TS-03): seed projects through the platform's own API using
 * the browser context's session cookie, so specs start from a known state
 * without driving the generation flow end-to-end every time.
 */

export interface SeededProject {
  id: string;
  urlId: string;
  description: string | null;
}

export interface SeedOptions {
  description?: string;
  urlId?: string;
  messages?: { id?: string; role: string; content: string }[];
  fileSnapshot?: Record<string, string>;
}

/**
 * Creates a project (POST /api/projects) and optionally fills messages /
 * snapshot via the idempotent PUT. The request context must belong to the
 * logged-in browser context so the session cookie is attached.
 */
export async function seedProject(request: APIRequestContext, options: SeedOptions = {}): Promise<SeededProject> {
  const created = await request.post('/api/projects', {
    data: { description: options.description, urlId: options.urlId },
  });

  if (!created.ok()) {
    throw new Error(`seedProject: create failed with ${created.status()}`);
  }

  const project = (await created.json()) as SeededProject;

  if (options.messages || options.fileSnapshot) {
    const updated = await request.put(`/api/projects/${project.id}`, {
      data: {
        description: options.description,
        ...(options.messages ? { messages: options.messages } : {}),
        ...(options.fileSnapshot ? { fileSnapshot: JSON.stringify(options.fileSnapshot) } : {}),
      },
    });

    if (!updated.ok()) {
      throw new Error(`seedProject: update failed with ${updated.status()}`);
    }
  }

  return project;
}
