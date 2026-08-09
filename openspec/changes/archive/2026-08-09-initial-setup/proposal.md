# Proposal: Initial Project Setup

## Intent

Build the A2 Atoms Demo — a full-stack Web application prototype that demonstrates
the core Atoms platform capabilities: natural language-driven app generation,
multi-agent collaboration, live preview, and data persistence.

This is a candidate evaluation project (ROOT 全栈岗位笔试) that must produce
a runnable, publicly accessible demo within 48 hours.

## Scope

- End-to-end generation pipeline: prompt → multi-agent analysis → code generation → live preview
- Project CRUD with persistent storage
- Multi-agent message flow visualization (PM → Architect → Engineer)
- Template system and project gallery (stretch goals)
- Deployment to Vercel with a public URL
- Source code published to a public GitHub repository

## Non-Goals

- Production-grade authentication or multi-tenancy
- Complex CI/CD pipelines
- Mobile-native applications
- Real-time collaboration between multiple users

## Approach

Use Next.js 14 (App Router) as the full-stack framework with Tailwind CSS and shadcn/ui
for rapid UI development. SQLite via Prisma ORM for zero-config persistence.
LLM integration through OpenAI/Anthropic API with an abstracted service layer.
Generated code rendered in sandboxed iframes for security isolation.

## Success Criteria

| Priority | Criterion |
|----------|-----------|
| P0 | Core generation flow works end-to-end |
| P0 | Deployed and accessible via public URL |
| P1 | Generated apps have real interactivity (not static) |
| P1 | Project data persists across sessions |
| P2 | At least one extension feature (templates / gallery) |
| P2 | Architecture documentation included |
