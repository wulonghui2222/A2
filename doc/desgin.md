# OpenSpec: Atoms Demo

> **Version**: 1.0.0  
> **Status**: Draft  
> **Author**: Candidate  
> **Created**: 2026-08-09  
> **Project**: ROOT 全栈岗位笔试 - Atoms Demo  

---

## 1. 概述

### 1.1 项目背景

A2是一个AI Agent 平台，用户通过自然语言描述需求，AI Agent 团队自动完成从需求分析到代码生成、部署上线的全流程，最终产出可运行的全栈 Web 应用。

本项目旨在构建一个 **Atoms Demo**——一个具备类似 Atoms 核心能力的 Web 应用原型，通过智能体驱动的方式完成代码（应用）生成，并将生成的应用以可视化网页形式展示。

### 1.2 项目目标

| 优先级 | 目标 | 说明 |
|--------|------|------|
| P0 | 核心主流程跑通 | 用户输入需求 → AI 生成应用 → 实时预览 → 数据持久化 |
| P0 | 可在线访问 | 部署上线，提供可测试的公开链接 |
| P1 | 真实交互 | 非静态展示，用户可与生成结果交互 |
| P1 | 数据持久化 | 项目数据可保存、回看、管理 |
| P2 | 延展能力 | 至少一个亮点功能（多 Agent 协作 / 模板系统 / 项目画廊等） |
| P2 | 说明文档 | 架构说明、技术选型理由、使用指南 |

### 1.3 约束条件

- **时间约束**：建议 6-8 小时专注开发，48 小时内提交
- **技术约束**：不限技术栈，需符合 vibe coding 风格
- **交付约束**：需提供在线访问链接 + GitHub 源码（public）
- **保密约束**：笔试内容仅限个人作答，不得对外传播

---

## 2. 术语表

| 术语 | 定义 |
|------|------|
| **Vibe Coding** | 通过自然语言描述意图，由 AI 生成代码的开发方式 |
| **Agent** | AI 智能体，具备特定角色和职责（PM、架构师、工程师等） |
| **Session** | 用户的一次应用生成会话，包含输入、生成过程和输出 |
| **Project** | 由 Session 产出的可预览应用实体，持久化存储 |
| **Preview** | 生成应用的实时可视化预览 |
| **Remix** | 复制已有项目作为起点进行二次创作 |
| **Human-in-the-Loop** | 人在环中，用户在关键节点审批和引导 AI |

---

## 3. 用户角色

| 角色 | 描述 | 核心诉求 |
|------|------|----------|
| **Creator**（应用创建者） | 通过自然语言描述需求，生成 Web 应用的用户 | 快速将想法转化为可运行应用 |
| **Visitor**（访客） | 浏览公开项目画廊的访客 | 查看和体验他人创建的应用 |

---

## 4. 功能需求

### 4.1 FR-01: 应用生成（核心）

**Priority**: P0

**描述**: 用户通过自然语言输入应用需求，系统调用 LLM 生成对应的 Web 应用代码，并渲染为可预览的页面。

#### 4.1.1 用户故事

```
US-01.1: 作为 Creator，我希望输入自然语言描述后系统能生成一个可预览的 Web 应用，
         以便我快速将想法转化为可视化产品。

US-01.2: 作为 Creator，我希望在生成过程中看到 AI 的思考和规划过程，
         以便我了解生成进度并随时干预。

US-01.3: 作为 Creator，我希望生成的应用具有真实交互（表单、按钮、导航等），
         而不仅仅是静态页面展示。
```

#### 4.1.2 验收标准

```gherkin
Scenario: 用户输入需求生成应用
  Given 用户在首页输入框中输入应用描述
  When 用户点击"生成"按钮或按下回车
  Then 系统显示生成进度（思考过程 / Agent 消息）
  And 生成完成后在预览区域展示可交互的 Web 应用
  And 预览应用包含至少一个可交互元素（按钮 / 表单 / 导航）

Scenario: 生成失败处理
  Given 用户输入了无效或过于模糊的需求
  When AI 无法生成有效应用
  Then 系统显示友好的错误提示
  And 提供修改建议或重试入口
```

#### 4.1.3 接口定义

```
POST /api/generate
  Request:
    body: {
      prompt: string          // 用户自然语言需求
      sessionId?: string      // 已有会话 ID（续写场景）
      model?: string          // 指定 LLM 模型
    }
  Response:
    200: {
      sessionId: string       // 会话 ID
      projectId: string       // 生成的项目 ID
      status: "generating" | "completed" | "failed"
      previewUrl: string      // 预览地址
      messages: AgentMessage[] // Agent 消息流
    }

GET /api/generate/:sessionId/status
  Response:
    200: {
      status: "generating" | "completed" | "failed"
      progress: number        // 0-100
      messages: AgentMessage[]
      previewUrl?: string
    }
```

---

### 4.2 FR-02: 多 Agent 协作流程

**Priority**: P1

**描述**: 系统模拟 Atoms 的多 Agent 团队，在生成过程中按角色分工协作，并向用户展示各 Agent 的工作状态和产出。

#### 4.2.1 用户故事

```
US-02.1: 作为 Creator，我希望看到不同 Agent 角色依次工作（PM 分析需求 → 架构师设计 → 工程师编码），
         以便我理解 AI 的工作流程并增强信任感。

US-02.2: 作为 Creator，我希望在关键节点（如需求确认）收到 Human-in-the-Loop 提示，
         以便我纠正 AI 的理解偏差。
```

#### 4.2.2 Agent 角色定义

| Agent | 职责 | 输入 | 输出 |
|-------|------|------|------|
| **PM Agent** | 需求分析，生成结构化需求摘要 | 用户原始 prompt | 需求规格（JSON） |
| **Architect Agent** | 技术方案设计，确定页面结构和组件 | 需求规格 | 架构方案（JSON） |
| **Engineer Agent** | 代码生成，输出 HTML/CSS/JS | 架构方案 | 可运行代码 |

#### 4.2.3 验收标准

```gherkin
Scenario: 多 Agent 依次协作生成
  Given 用户输入应用需求
  When 生成流程启动
  Then 界面依次显示 PM Agent → Architect Agent → Engineer Agent 的工作消息
  And 每个 Agent 消息包含角色名称、头像和产出摘要
  And 最终 Engineer Agent 输出可预览的代码

Scenario: Human-in-the-Loop 审批
  Given PM Agent 完成需求分析
  When 系统展示需求摘要并请求确认
  Then 用户可以确认继续或修改需求
  And 确认后流程继续到下一 Agent
```

---

### 4.3 FR-03: 应用预览

**Priority**: P0

**描述**: 用户可以实时预览 AI 生成的 Web 应用，预览应用在 iframe 沙盒中渲染，支持交互操作。

#### 4.3.1 用户故事

```
US-03.1: 作为 Creator，我希望生成完成后立即看到应用的真实渲染效果，
         以便我评估生成质量。

US-03.2: 作为 Creator，我希望预览中的应用是可交互的（点击按钮、填写表单、切换页面），
         以便我验证功能是否正常。

US-03.3: 作为 Creator，我希望能切换预览的设备尺寸（桌面 / 平板 / 手机），
         以便我检查响应式效果。
```

#### 4.3.2 验收标准

```gherkin
Scenario: 查看应用预览
  Given 项目生成完成
  When 用户进入项目详情页
  Then 预览区域在 iframe 中渲染生成的应用
  And 预览应用支持点击、输入等基本交互
  And 支持切换桌面/平板/手机视口

Scenario: 预览刷新
  Given 用户对项目进行了修改（重新生成 / 迭代）
  When 生成完成
  Then 预览区域自动刷新展示最新版本
```

---

### 4.4 FR-04: 数据持久化

**Priority**: P0

**描述**: 系统持久化存储用户的项目数据，包括项目元信息、生成代码、会话历史等。

#### 4.4.1 用户故事

```
US-04.1: 作为 Creator，我希望我生成的项目被自动保存，
         以便我下次回来可以继续查看和编辑。

US-04.2: 作为 Creator，我希望能查看我的所有项目列表，
         以便我管理历史创作。
```

#### 4.4.2 数据模型

```typescript
// 项目
interface Project {
  id: string;              // 唯一标识
  title: string;           // 项目标题（AI 生成）
  description: string;     // 项目描述
  prompt: string;          // 原始用户输入
  code: string;            // 生成的应用代码（HTML/CSS/JS）
  status: "generating" | "completed" | "failed";
  createdAt: string;       // 创建时间
  updatedAt: string;       // 更新时间
  thumbnail?: string;      // 缩略图（截图 URL）
  isPublic: boolean;       // 是否公开
  viewCount: number;       // 浏览次数
  tags: string[];          // 标签
}

// 会话消息
interface AgentMessage {
  id: string;
  sessionId: string;
  agentRole: "pm" | "architect" | "engineer" | "system" | "user";
  content: string;
  type: "text" | "plan" | "code" | "error";
  timestamp: string;
  metadata?: {
    plan?: object;         // PM 产出的需求规格
    architecture?: object; // 架构师产出的方案
    code?: string;         // 工程师产出的代码
  };
}

// 会话
interface Session {
  id: string;
  projectId: string;
  messages: AgentMessage[];
  status: "active" | "completed" | "archived";
  createdAt: string;
}
```

#### 4.4.3 验收标准

```gherkin
Scenario: 项目自动保存
  Given 用户完成一次应用生成
  When 生成状态变为 completed
  Then 项目数据（元信息 + 代码 + 消息历史）被持久化到数据库
  And 用户在项目列表中可以看到该项目

Scenario: 历史项目回看
  Given 用户曾经生成过项目
  When 用户打开项目列表页
  Then 显示所有历史项目，按更新时间倒序排列
  And 点击项目可查看详情和预览
```

---

### 4.5 FR-05: 项目管理

**Priority**: P1

**描述**: 用户可以管理自己的项目列表，包括查看、搜索、删除等操作。

#### 4.5.1 用户故事

```
US-05.1: 作为 Creator，我希望能搜索我的项目（按标题或内容），
         以便快速找到目标项目。

US-05.2: 作为 Creator，我希望能删除不需要的项目，
         以便保持项目列表整洁。
```

#### 4.5.2 验收标准

```gherkin
Scenario: 项目列表展示
  Given 用户进入"我的项目"页面
  When 页面加载
  Then 以卡片网格形式展示所有项目
  And 每张卡片显示标题、描述、缩略图、更新时间
  And 支持按时间/名称排序

Scenario: 项目搜索
  Given 用户在搜索框输入关键词
  When 输入内容变化
  Then 项目列表实时过滤匹配的项目
```

---

### 4.6 FR-06: 模板系统（延展能力）

**Priority**: P2

**描述**: 系统提供预设模板，用户可以基于模板快速创建应用，类似 Atoms 的 Remix 功能。

#### 4.6.1 用户故事

```
US-06.1: 作为 Creator，我希望从模板库中选择一个起点，
         以便我快速开始而不必从零描述。

US-06.2: 作为 Creator，我希望能 Remix 他人的公开项目，
         以便在其基础上进行二次创作。
```

#### 4.6.2 验收标准

```gherkin
Scenario: 从模板创建
  Given 用户在首页看到模板推荐区域
  When 用户点击某个模板
  Then 系统以该模板的 prompt 预填输入框
  And 用户可修改后生成，或直接生成

Scenario: Remix 公开项目
  Given 用户在项目画廊浏览
  When 用户点击某个公开项目的"Remix"按钮
  Then 系统复制该项目的 prompt 和代码到新会话
  And 用户可在此基础上继续编辑和生成
```

---

### 4.7 FR-07: 项目画廊（延展能力）

**Priority**: P2

**描述**: 系统提供公开项目展示页面，类似 Atoms 的 App World，访客可以浏览和体验他人创建的应用。

#### 4.7.1 用户故事

```
US-07.1: 作为 Visitor，我希望浏览公开项目画廊，
         以便获取灵感和体验不同类型的应用。

US-07.2: 作为 Visitor，我希望能直接在画廊中体验项目，
         而不需要登录或跳转。
```

#### 4.7.2 验收标准

```gherkin
Scenario: 浏览项目画廊
  Given 用户访问画廊页面
  When 页面加载
  Then 展示所有公开项目，按热度排序
  And 支持按标签/类别过滤
  And 每个项目卡片支持点击预览
```

---

### 4.8 FR-08: 迭代编辑（延展能力）

**Priority**: P2

**描述**: 用户可以在已生成的项目基础上，通过对话方式继续修改和迭代应用。

#### 4.8.1 用户故事

```
US-08.1: 作为 Creator，我希望在项目详情页通过对话继续修改应用，
         例如"把按钮改成蓝色"、"增加一个登录页面"。

US-08.2: 作为 Creator，我希望能查看代码视图，
         以便我了解 AI 生成的具体实现。
```

#### 4.8.2 验收标准

```gherkin
Scenario: 迭代修改
  Given 用户在项目详情页
  When 用户在对话框输入修改指令（如"添加一个暗色模式切换"）
  Then AI 基于当前代码进行修改
  And 预览区域刷新展示修改后的效果
  And 修改历史被记录到会话消息中

Scenario: 代码视图切换
  Given 用户在项目详情页
  When 用户点击"代码"标签
  Then 展示当前应用的源代码（语法高亮）
  And 支持代码复制
```

---

## 5. 非功能需求

### 5.1 NFR-01: 性能

| 指标 | 要求 |
|------|------|
| 首屏加载时间 | < 3s（LCP） |
| AI 生成响应时间 | < 60s（单次生成） |
| 预览渲染时间 | < 2s |
| API 响应时间（非生成类） | < 500ms |
| 并发支持 | 至少 10 个并发用户 |

### 5.2 NFR-02: 可用性

- 所有交互元素在 200ms 内给出视觉反馈
- 生成过程有明确的加载状态和进度指示
- 错误场景有友好的错误提示和恢复路径
- 移动端基本可用（响应式布局）

### 5.3 NFR-03: 数据安全

- 用户输入经 sanitize 后再渲染，防止 XSS
- 生成的代码在 iframe sandbox 中运行，隔离风险
- API 接口做 rate limiting（防滥用）
- 不存储敏感信息（API Key 等仅在服务端使用）

### 5.4 NFR-04: 可部署性

- 支持一键部署到 Vercel / Cloudflare Pages
- 环境变量管理 API Key 等敏感配置
- 构建产物 < 50MB
- 提供 Dockerfile（可选）

### 5.5 NFR-05: 可扩展性

- 模块化架构，Agent 角色可插拔
- LLM 接入层抽象，支持切换不同模型
- 数据层抽象，支持从 SQLite 迁移到 PostgreSQL
- 模板系统可扩展，支持动态添加模板

---

## 6. 技术架构

### 6.1 技术选型

| 层 | 技术方案 | 选型理由 |
|----|----------|----------|
| **前端框架** | Next.js 14 (App Router) | SSR + API Routes 一体化，部署方便，生态成熟 |
| **UI 库** | Tailwind CSS + shadcn/ui | 快速开发，一致性设计，组件可定制 |
| **AI 接入** | OpenAI API / Anthropic API | 主流 LLM，代码生成能力强 |
| **数据库** | SQLite (Prisma ORM) | 轻量级，零配置，满足 Demo 需求，可迁移 |
| **代码渲染** | iframe sandbox | 安全隔离 AI 生成的代码 |
| **部署** | Vercel | 与 Next.js 无缝集成，免费额度充足 |
| **状态管理** | Zustand | 轻量，TypeScript 友好 |
| **代码高亮** | Shiki | 轻量，支持多语言 |

### 6.2 系统架构图

```
┌─────────────────────────────────────────────────┐
│                   前端 (Next.js)                  │
│                                                   │
│  ┌─────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  首页   │  │ 项目详情  │  │  项目画廊      │  │
│  │ Chat UI │  │ 预览+代码 │  │  Gallery       │  │
│  └────┬────┘  └────┬─────┘  └───────┬────────┘  │
│       │            │                 │            │
│  ┌────▼────────────▼─────────────────▼────────┐  │
│  │            Zustand Store (状态管理)         │  │
│  └────────────────────┬───────────────────────┘  │
│                       │                           │
│  ┌────────────────────▼───────────────────────┐  │
│  │            API Routes (Next.js)             │  │
│  │  /api/generate  /api/projects  /api/templates│  │
│  └────────────────────┬───────────────────────┘  │
└───────────────────────┼───────────────────────────┘
                        │
┌───────────────────────▼───────────────────────────┐
│                  后端服务层                         │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ PM Agent │→ │ Arch Agent│→ │ Engineer Agent│   │
│  │ 需求分析  │  │ 架构设计  │  │  代码生成     │   │
│  └──────────┘  └──────────┘  └──────┬───────┘   │
│                                     │             │
│  ┌──────────────────────────────────▼──────────┐ │
│  │          LLM Service (抽象层)               │ │
│  │   OpenAI API  /  Anthropic API              │ │
│  └─────────────────────────────────────────────┘ │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │          Data Layer (Prisma ORM)            │ │
│  │   SQLite: Projects / Sessions / Messages    │ │
│  └─────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────┘
```

### 6.3 核心流程

```
用户输入 prompt
    │
    ▼
PM Agent 分析需求 ──→ 生成结构化需求摘要
    │                    │
    │           (Human-in-the-Loop: 用户确认)
    │                    │
    ▼                    ▼
Architect Agent ──→ 生成页面结构方案
    │                    │
    ▼                    ▼
Engineer Agent ──→ 调用 LLM 生成 HTML/CSS/JS
    │                    │
    ▼                    ▼
代码持久化 ──→ 写入数据库
    │
    ▼
渲染预览 ──→ iframe sandbox 展示
    │
    ▼
项目保存 ──→ 项目列表更新
```

---

## 7. 页面规格

### 7.1 页面清单

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | Chat 输入框 + 模板推荐 + Agent 介绍 |
| `/projects` | 项目列表 | 我的项目卡片网格 |
| `/projects/[id]` | 项目详情 | 预览 + 代码 + 对话迭代 |
| `/gallery` | 项目画廊 | 公开项目展示 |
| `/templates` | 模板库 | 预设模板浏览 |

### 7.2 首页布局

```
┌─────────────────────────────────────────────┐
│  Logo                            [Gallery]   │
├─────────────────────────────────────────────┤
│                                             │
│         用自然语言构建你的下一个应用            │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  描述你想要的应用...              [→] │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │ 模板 1  │ │ 模板 2  │ │ 模板 3  │       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  AI Agent 团队                       │    │
│  │  PM → Architect → Engineer           │    │
│  └─────────────────────────────────────┘    │
│                                             │
└─────────────────────────────────────────────┘
```

### 7.3 项目详情页布局

```
┌─────────────────────────────────────────────┐
│  ← Back    Project Title    [Code] [Preview] │
├──────────────────────┬──────────────────────┤
│                      │                      │
│   Agent 消息流        │    应用预览 / 代码    │
│                      │                      │
│  ┌────────────────┐  │  ┌────────────────┐  │
│  │ PM: 分析需求...│  │  │                │  │
│  └────────────────┘  │  │   iframe       │  │
│  ┌────────────────┐  │  │   (应用预览)    │  │
│  │ Arch: 设计...  │  │  │                │  │
│  └────────────────┘  │  │                │  │
│  ┌────────────────┐  │  └────────────────┘  │
│  │ Eng: 生成代码..│  │  [Desktop][Tablet][📱]│
│  └────────────────┘  │                      │
│                      │                      │
│  ┌────────────────┐  │                      │
│  │ 输入修改指令...│  │                      │
│  └────────────────┘  │                      │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

---

## 8. API 规格

### 8.1 API 总览

| Method | Path | 说明 |
|--------|------|------|
| POST | `/api/generate` | 生成应用 |
| GET | `/api/generate/:sessionId/status` | 查询生成状态 |
| GET | `/api/projects` | 获取项目列表 |
| GET | `/api/projects/:id` | 获取项目详情 |
| PUT | `/api/projects/:id` | 更新项目 |
| DELETE | `/api/projects/:id` | 删除项目 |
| GET | `/api/projects/:id/messages` | 获取会话消息 |
| POST | `/api/projects/:id/iterate` | 迭代修改 |
| GET | `/api/templates` | 获取模板列表 |
| GET | `/api/gallery` | 获取公开项目 |

### 8.2 详细定义

#### POST /api/generate

```
Request Body:
{
  "prompt": "一个带用户登录和待办事项管理的 SaaS 应用",
  "model": "claude-sonnet-4"  // optional
}

Response 200:
{
  "sessionId": "sess_abc123",
  "projectId": "proj_xyz789",
  "status": "generating",
  "messages": [
    {
      "id": "msg_001",
      "agentRole": "pm",
      "content": "正在分析你的需求...",
      "type": "text",
      "timestamp": "2026-08-09T16:30:00Z"
    }
  ]
}

Response 400:
{
  "error": "Prompt is required",
  "code": "MISSING_PROMPT"
}
```

#### POST /api/projects/:id/iterate

```
Request Body:
{
  "instruction": "把按钮改成蓝色，增加一个暗色模式切换",
  "currentCode": "<html>...</html>"
}

Response 200:
{
  "projectId": "proj_xyz789",
  "status": "completed",
  "updatedCode": "<html>...updated...</html>",
  "message": {
    "id": "msg_010",
    "agentRole": "engineer",
    "content": "已完成以下修改：1. 按钮颜色改为蓝色 2. 增加暗色模式切换",
    "type": "text",
    "timestamp": "2026-08-09T16:35:00Z"
  }
}
```

---

## 9. 风险与应对

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| LLM 生成代码质量不稳定 | 高 | 高 | 优化 prompt 模板；生成后做基本验证；支持迭代修改 |
| 生成时间过长 | 中 | 高 | 流式输出 Agent 消息；设置超时和重试机制 |
| 部署环境配置问题 | 中 | 中 | 提前验证部署流程；准备 Dockerfile 降级方案 |
| API 费用超预算 | 中 | 中 | 缓存常见模板生成结果；限制单用户生成次数 |
| iframe 安全风险 | 低 | 高 | sandbox 属性隔离；sanitize 用户输入 |

---

## 10. 交付物清单

| 交付物 | 说明 | 状态 |
|--------|------|------|
| 在线访问链接 | 部署在 Vercel 的可测试应用 | 待开发 |
| GitHub 仓库 | 源代码（public 权限） | 待创建 |
| 说明文档 | 架构说明、技术选型、使用指南 | 待编写 |
| AI 工具使用记录 | Cursor/Claude Code 等使用截图（加分项） | 待整理 |

---

## 11. 里程碑计划

| 阶段 | 时间 | 产出 |
|------|------|------|
| **M1: 项目初始化** | 0.5h | Next.js 项目搭建、UI 框架配置、数据库初始化 |
| **M2: 核心生成流程** | 3h | Chat UI + LLM 接入 + 代码生成 + 预览渲染 |
| **M3: 数据持久化** | 1h | 项目 CRUD + 会话消息存储 |
| **M4: 多 Agent 流程** | 1.5h | PM/Architect/Engineer Agent 消息流展示 |
| **M5: 延展功能** | 1h | 模板系统 / 项目画廊（选做） |
| **M6: 部署 & 文档** | 1h | Vercel 部署 + README + 说明文档 |

---

## 附录 A: Prompt 模板

### PM Agent System Prompt

```
你是一个产品经理 Agent。你的任务是分析用户的自然语言需求，
生成结构化的需求规格。输出 JSON 格式：
{
  "title": "应用标题",
  "description": "一句话描述",
  "pages": [{"name": "页面名", "elements": ["元素列表"]}],
  "features": ["功能列表"],
  "dataModels": [{"name": "模型名", "fields": [{"name": "字段名", "type": "类型"}]}]
}
```

### Architect Agent System Prompt

```
你是一个系统架构师 Agent。基于需求规格，设计页面结构和技术方案。
输出 JSON 格式：
{
  "layout": "页面布局描述",
  "components": ["组件列表"],
  "styles": "样式方案描述",
  "interactions": ["交互行为列表"]
}
```

### Engineer Agent System Prompt

```
你是一个全栈工程师 Agent。基于架构方案，生成完整的单文件 HTML 应用
（内联 CSS 和 JavaScript）。要求：
1. 使用 Tailwind CSS（CDN）
2. 包含真实交互（表单、按钮、导航等）
3. 数据使用 localStorage 持久化
4. 响应式设计
5. 现代化 UI 风格
输出完整的 HTML 代码。
```
