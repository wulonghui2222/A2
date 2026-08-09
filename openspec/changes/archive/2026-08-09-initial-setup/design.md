# Design: Initial Project Setup

## Architecture Overview

```
┌───────────────────────────────────────────────────┐
│                 Frontend (Next.js)                  │
│                                                     │
│  ┌─────────┐  ┌───────────┐  ┌─────────────────┐  │
│  │  Home   │  │  Project  │  │    Gallery       │  │
│  │ Chat UI │  │  Detail   │  │                  │  │
│  └────┬────┘  └────┬──────┘  └────────┬────────┘  │
│       │            │                   │            │
│  ┌────▼────────────▼───────────────────▼─────────┐ │
│  │            Zustand Store (state mgmt)          │ │
│  └────────────────────┬───────────────────────────┘ │
│                       │                              │
│  ┌────────────────────▼───────────────────────────┐ │
│  │            API Routes (Next.js)                 │ │
│  │  /api/generate  /api/projects  /api/templates   │ │
│  └────────────────────┬───────────────────────────┘ │
└───────────────────────┼──────────────────────────────┘
                        │
┌───────────────────────▼──────────────────────────────┐
│                  Backend Service Layer                │
│                                                      │
│  ┌──────────┐  ┌────────────┐  ┌─────────────────┐  │
│  │ PM Agent │→ │ Arch Agent │→ │ Engineer Agent   │  │
│  └──────────┘  └────────────┘  └────────┬────────┘  │
│                                         │            │
│  ┌──────────────────────────────────────▼─────────┐ │
│  │          LLM Service (abstract layer)           │ │
│  │       OpenAI API  /  Anthropic API              │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │          Data Layer (Prisma ORM)               │ │
│  │   SQLite: Projects / Sessions / Messages       │ │
│  └────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Tech Stack Decisions

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Frontend framework | Next.js 14 (App Router) | SSR + API Routes, Vercel-native deploy |
| UI library | Tailwind CSS + shadcn/ui | Rapid development, consistent design |
| AI integration | OpenAI / Anthropic API | Industry-leading code generation |
| Database | SQLite (Prisma ORM) | Zero config, sufficient for demo, migratable |
| Code rendering | iframe sandbox | Security isolation for AI-generated code |
| Deployment | Vercel | Seamless Next.js integration, free tier |
| State management | Zustand | Lightweight, TypeScript-friendly |
| Code highlighting | Shiki | Lightweight, multi-language support |

## Key Design Decisions

### 1. Agent Pipeline

The three-agent pipeline (PM → Architect → Engineer) runs sequentially on the server.
Each agent is a separate LLM call with a dedicated system prompt. Messages are streamed
to the client via Server-Sent Events (SSE) for real-time progress display.

### 2. Code Generation Output

The Engineer Agent produces a single-file HTML application (inline CSS + JS). This
simplifies preview rendering (direct `srcdoc` on iframe) and persistence (single `code`
field in DB). For more complex apps, this can evolve into a multi-file structure later.

### 3. Data Storage

SQLite via Prisma provides a zero-setup experience. The schema includes three models:
`Project`, `Session`, and `AgentMessage`. This can migrate to PostgreSQL later
by changing the Prisma datasource.

### 4. Preview Security

Generated code runs inside an `<iframe sandbox="allow-scripts allow-forms">`. User input
is sanitized before being passed to the LLM. API routes enforce rate limiting.

## Page Routes

| Route | Page | Description |
|-------|------|-------------|
| `/` | Home | Chat input + template recommendations + agent intro |
| `/projects` | Project List | Card grid of user's projects |
| `/projects/[id]` | Project Detail | Preview + code + conversational iteration |
| `/gallery` | Gallery | Public project showcase |
| `/templates` | Templates | Preset template browser |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/generate` | Start app generation |
| GET | `/api/generate/:sessionId/status` | Poll generation status |
| GET | `/api/projects` | List user projects |
| GET | `/api/projects/:id` | Get project detail |
| PUT | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| GET | `/api/projects/:id/messages` | Get session messages |
| POST | `/api/projects/:id/iterate` | Iterate on project |
| GET | `/api/templates` | List templates |
| GET | `/api/gallery` | List public projects |

## Feature List

| ID | Feature | Priority | Milestone | Tasks | Description |
|----|---------|----------|-----------|-------|-------------|
| FR-01 | 应用生成 | P0 | M2 | 2.1–2.7, 3.1–3.2 | 自然语言输入 → LLM 生成 → 实时预览 |
| FR-02 | 多 Agent 协作 | P1 | M4 | 3.3–3.4, 6.1–6.4 | PM→Architect→Engineer 顺序协作 + Human-in-the-Loop |
| FR-03 | 应用预览 | P0 | M2 | 4.1–4.2 | iframe sandbox 渲染 + 响应式视口切换 |
| FR-04 | 数据持久化 | P0 | M1+M3 | 5.1 | 项目元信息 + 代码 + 会话消息自动保存 |
| FR-05 | 项目管理 | P1 | M3 | 5.2–5.5 | 项目列表 CRUD + 搜索 + 删除 |
| FR-06 | 模板系统 | P2 | M5 | 7.1–7.3 | 预设模板 + Remix 公开项目 |
| FR-07 | 项目画廊 | P2 | M5 | 7.4–7.5 | 公开项目展示 + 标签过滤 + 热度排序 |
| FR-08 | 迭代编辑 | P2 | M2 | 4.3–4.4 | 对话式修改 + 代码视图 |
| NFR-01 | 性能 | P1 | M2–M6 | — | LCP<3s, 生成<60s, API<500ms |
| NFR-02 | 可用性 | P1 | M2–M6 | 8.3–8.5 | 200ms 反馈, 加载状态, 错误恢复 |
| NFR-03 | 安全 | P1 | M2–M6 | 8.1–8.2 | XSS 防护, iframe sandbox, rate limiting |
| NFR-04 | 可部署性 | P0 | M6 | 9.1–9.2 | Vercel 一键部署, <50MB |
| NFR-05 | 可扩展性 | P2 | M1 | 1.5 | Agent 可插拔, LLM 抽象, DB 可迁移 |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| LLM output quality varies | Optimized prompt templates; post-generation validation; iteration support |
| Long generation times | Streaming agent messages; timeout + retry mechanism |
| iframe security | Sandbox attributes; input sanitization |
| API cost overrun | Cache common template outputs; per-user generation limits |
