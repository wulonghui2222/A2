# Tasks: Initial Project Setup

## 1. Project Scaffolding (M1 — 0.5h)

- [x] 1.1 Initialize Next.js 14 project with App Router, TypeScript, Tailwind CSS
- [x] 1.2 Install and configure shadcn/ui, Zustand, Prisma, Shiki
- [x] 1.3 Define Prisma schema (Project, Session, AgentMessage) and run migration
- [x] 1.4 Set up project directory structure (`app/`, `lib/`, `components/`)
- [x] 1.5 Configure abstract LLM service layer (OpenAI / Anthropic adapter) — *NFR-05*

## 2. Core Generation Pipeline — FR-01 (M2 — 3h)

- [x] 2.1 Implement PM Agent (system prompt → structured requirement JSON)
- [x] 2.2 Implement Architect Agent (requirement → page structure JSON)
- [x] 2.3 Implement Engineer Agent (architecture → single-file HTML/CSS/JS)
- [x] 2.4 Wire sequential pipeline with streaming agent messages (SSE)
- [x] 2.5 Create `POST /api/generate` endpoint
- [x] 2.6 Create `GET /api/generate/:sessionId/status` polling endpoint
- [x] 2.7 Add error handling and retry mechanism for generation failures

## 3. Frontend — Home & Generation — FR-01, FR-02 (M2 — incl. above)

- [x] 3.1 Build home page layout with hero section and prompt input
- [x] 3.2 Implement generation progress UI (agent message stream with avatars)
- [ ] 3.3 Add Human-in-the-Loop confirmation step after PM Agent — *FR-02*
- [x] 3.4 Display agent role labels and output summaries — *FR-02*

## 4. Frontend — Preview & Project Detail — FR-03, FR-08 (M2 — incl. above)

- [x] 4.1 Build project detail page with iframe preview (`sandbox="allow-scripts allow-forms"`)
- [x] 4.2 Implement viewport switcher (desktop / tablet / phone)
- [x] 4.3 Add code view tab with syntax highlighting — *FR-08*
- [ ] 4.4 Implement conversational iteration input (`POST /api/projects/:id/iterate`) — *FR-08*

## 5. Data Layer & Project Management — FR-04, FR-05 (M3 — 1h)

- [x] 5.1 Implement auto-save on generation completion — *FR-04*
- [ ] 5.2 Implement project CRUD API (`GET/PUT/DELETE /api/projects`)
- [ ] 5.3 Build "My Projects" page with card grid layout
- [ ] 5.4 Add real-time search and sort functionality — *FR-05*
- [ ] 5.5 Implement project delete with confirmation dialog

## 6. Multi-Agent Visualization — FR-02 (M4 — 1.5h)

- [x] 6.1 Design agent avatar and role badge components
- [x] 6.2 Build agent message timeline component
- [ ] 6.3 Implement Human-in-the-Loop approval modal
- [ ] 6.4 Add agent transition animations

## 7. Extension Features — FR-06, FR-07 (M5 — 1h, Stretch)

- [ ] 7.1 Create template seed data and `GET /api/templates` endpoint — *FR-06*
- [ ] 7.2 Build template browser page — *FR-06*
- [ ] 7.3 Implement Remix: copy project prompt + code to new session — *FR-06*
- [ ] 7.4 Build public project gallery with tag filtering — *FR-07*
- [ ] 7.5 Implement gallery sort by popularity (viewCount) — *FR-07*

## 8. Non-Functional Requirements (M2-M6 — ongoing)

- [ ] 8.1 Input sanitization (DOMPurify / similar) — *NFR-03*
- [ ] 8.2 Rate limiting middleware on API routes — *NFR-03*
- [x] 8.3 Loading states and progress indicators across all pages — *NFR-02*
- [x] 8.4 Error boundary and friendly error pages — *NFR-02*
- [x] 8.5 Responsive layout for mobile breakpoints — *NFR-02*

## 9. Deployment & Documentation — NFR-04 (M6 — 1h)

- [x] 9.1 Configure environment variables (LLM API keys, database URL)
- [ ] 9.2 Deploy to Vercel and verify live URL — *NFR-04*
- [ ] 9.3 Write README with architecture explanation and setup guide
- [ ] 9.4 Push source code to public GitHub repository
