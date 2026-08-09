# Proposal: Model Selection — Qwen3.8-Max & Kimi-K3 via Alibaba Bailian

## Intent

当前系统仅支持 OpenAI / Anthropic 两家 LLM 供应商，且用户在对话界面无法切换模型。
本次变更引入**阿里云百炼**作为新的 LLM 供应商，支持 **Qwen3.8-Max** 和 **Kimi-K3** 两个模型，
并在首页对话框中增加模型选择器，让用户在提交需求前自主选择使用哪个模型生成应用。

## Scope

- 新增 LLM provider: `bailian`（阿里百炼，OpenAI-compatible API）
- 新增两个可选模型: `Qwen3.8-Max`、`Kimi-K3`
- 首页输入框区域新增**模型选择下拉框**，默认选中第一个模型
- API 层支持透传用户选择的 `model` 参数
- 环境变量: 新增 `BAILIAN_API_KEY`

## Non-Goals

- 不涉及用户账号体系或模型权限管理
- 不涉及模型使用量计费 / 限制
- 不涉及替换已有 OpenAI / Anthropic 接入（保持向后兼容）

## Approach

阿里百炼提供 OpenAI-compatible 的 chat completions 端点
（`https://dashscope.aliyuncs.com/compatible-mode/v1`），
可复用现有 `openai` npm SDK，只需切换 `baseURL` 和 `apiKey` 即可，无需引入新的 SDK。

模型 ID 映射:

| 展示名 | 百炼 API model ID |
|--------|-------------------|
| Qwen3.8-Max | `qwen3-max` |
| Kimi-K3 | `kimi-k3` |

UI 上以 `<select>` 下拉框呈现，放在输入框左上角，默认选中 Qwen3.8-Max。

## Affected Specs

- **FR-01 Application Generation** — MODIFIED: 新增模型选择参数
- **NFR-05 Extensibility** — MODIFIED: 新增 bailian provider
