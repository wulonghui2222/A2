# Test Suite 自动化测试体系

## Purpose

为 workbench 定义自动化测试体系的行为契约：规定哪些核心模块必须具备单元测试、
哪些关键用户流必须具备端到端（E2E）覆盖、测试的隔离与确定性要求，以及开发者
本地运行测试的统一入口，从而为持续回归验证既有能力（user-auth、workbench、
project-plaza、llm-gateway、app-core）提供保障。

## Requirements

### Requirement: TS-01 Unit Test Coverage of Core Modules

The system SHALL provide automated unit tests in workbench covering the following
module categories, with each test runnable offline and without external services:

- `app/utils` 中的纯函数模块（至少包括 diff、shell、stripIndent、promises、
  debounce、buffer、classNames、folderImport、projectCommands、
  selectStarterTemplate）
- `app/lib` 中的核心逻辑（至少包括 crypto、fetch 封装、runtime 消息/动作解析
  的既有测试保持通过）
- `app/a2` 持久化与服务端逻辑（至少包括 db 读写、session 校验、plaza 公开
  可见性判定），使用临时或内存数据库，不得依赖共享开发数据库

单元测试 SHALL 按既有约定以 `*.spec.ts` 与被测文件同目录共存。

#### Scenario: Core module unit tests pass locally

- **WHEN** a developer runs the workbench unit test suite from a clean checkout
- **THEN** all unit tests pass without network access, real LLM credentials, or a running dev server

#### Scenario: Persistence tests do not pollute the dev database

- **WHEN** server-side persistence tests execute
- **THEN** they read and write only a throwaway database created for the test run
- **AND** the developer's local SQLite data remains untouched

### Requirement: TS-02 E2E Coverage of Key User Flows

The system SHALL provide automated browser-driven E2E tests covering the following
user flows, each traced to an existing requirement:

| E2E flow | Covered requirement |
|----------|--------------------|
| 注册新用户 | UA-01 (User Registration) |
| 登录与登出 | UA-02 / UA-03 (Login, Session Management) |
| 未登录访问受保护页面跳转登录 | UA-04 (Route Protection) |
| 我的项目列表与打开项目聊天页 | WB-06 / WB-07 (Chat Persistence, My Projects) |
| 聊天提交 prompt 并获得流式响应 | FR-01 / WB-01 (Application Generation, Chat-Based Generation) |
| 项目广场列表与公开项目只读体验 | PL-01 / PL-02 (Plaza Listing, Read-Only Public Project) |
| 项目公开可见性切换在广场生效 | WB-10 (Public Visibility Toggle) |

#### Scenario: Full auth-to-generation journey

- **WHEN** the E2E suite runs against a locally started workbench instance
- **THEN** a freshly registered user can log in, open the workbench, submit a prompt, and observe streamed assistant output
- **AND** every flow in the table above has at least one passing automated scenario

#### Scenario: Protected route redirect

- **WHEN** an unauthenticated browser session navigates to the workbench chat page
- **THEN** the E2E test observes a redirect to the login page with return to the original destination

### Requirement: TS-03 Test Isolation and Determinism

The test suites SHALL be deterministic and isolated:

- E2E 生成流 SHALL 通过打桩/替换 LLM 网关响应获得固定脚本输出，不得消耗真实
  模型配额，不得依赖第三方模型服务可用性
- 每个 E2E 测试 SHALL 使用独立的测试账号与（或）独立的测试数据库状态，测试间
  不得相互依赖执行顺序
- 测试 SHALL NOT 依赖 WebContainer 内真实构建成功作为通过条件；预览相关断言
  仅验证平台自身行为（消息流、文件产出、状态指示）

#### Scenario: E2E run is repeatable without LLM quota

- **WHEN** the E2E suite runs twice consecutively in an environment with no valid LLM API key
- **THEN** both runs produce identical pass/fail outcomes

#### Scenario: Tests are order-independent

- **WHEN** any single E2E test is run in isolation
- **THEN** it passes without requiring another test to run first

### Requirement: TS-04 Test Run Entry Points

The system SHALL expose local entry points for the test suites:

- `pnpm test` SHALL run the complete unit test suite (既有脚本，保持语义不变)
- `pnpm test:e2e` SHALL 自动准备所需服务（workbench 本地实例）并运行全部 E2E
  测试，结束后清理
- `pnpm test:all` SHALL 依次运行单元测试与 E2E 测试，并以非零退出码报告任何失败

#### Scenario: One-command full regression

- **WHEN** a developer runs `pnpm test:all` on a healthy checkout
- **THEN** both suites execute and the command exits 0
- **AND** when any test fails, the command exits non-zero with the failing test identified

#### Scenario: E2E entry point manages its own server

- **WHEN** a developer runs `pnpm test:e2e` without manually starting the dev server
- **THEN** the runner starts the workbench instance, executes the tests, and shuts the instance down afterwards
