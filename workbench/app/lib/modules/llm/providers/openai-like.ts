import { BaseProvider, getOpenAILikeModel } from '~/lib/modules/llm/base-provider';
import type { ModelInfo } from '~/lib/modules/llm/types';
import type { IProviderSetting } from '~/types/model';
import type { LanguageModelV1 } from 'ai';
import { A2_CLIENT_KEY_PLACEHOLDER, A2_DEFAULT_MODEL, A2_ENABLE_BYOK, A2_LLM_BASE_URL } from '~/a2/config';

export default class OpenAILikeProvider extends BaseProvider {
  name = 'OpenAILike';
  getApiKeyLink = undefined;

  config = {
    baseUrlKey: 'OPENAI_LIKE_API_BASE_URL',
    apiTokenKey: 'OPENAI_LIKE_API_KEY',

    // A2 (task 2.4): platform gateway endpoint; the real credential is injected
    // by the gateway, so clients never see or configure a key (LG-02/LG-04).
    baseUrl: A2_LLM_BASE_URL,
  };

  // A2: expose the platform default model without requiring an API key;
  // the key is injected server-side via serverEnv (design D5).
  staticModels: ModelInfo[] = [
    {
      name: A2_DEFAULT_MODEL,
      label: A2_DEFAULT_MODEL,
      provider: 'OpenAILike',

      // A2: reasoning models count thinking tokens toward completion tokens;
      // 8000 caused constant truncation + continue round-trips.
      maxTokenAllowed: 32768,
    },
  ];

  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv: Record<string, string> = {},
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv,
      defaultBaseUrlKey: 'OPENAI_LIKE_API_BASE_URL',
      defaultApiTokenKey: 'OPENAI_LIKE_API_KEY',
    });

    if (!baseUrl || !apiKey) {
      return [];
    }

    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const res = (await response.json()) as any;

    return res.data.map((model: any) => ({
      name: model.id,
      label: model.id,
      provider: this.name,
      maxTokenAllowed: 8000,
    }));
  }

  getModelInstance(options: {
    model: string;
    serverEnv: Env;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModelV1 {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    // A2 (LG-02/LG-04): when BYOK is disabled, always route through the
    // platform gateway. Stale cookies (apiKeys/providers) from before BYOK
    // was turned off must not override the gateway URL or inject a stale key
    // that bypasses the server-side credential injection.
    const cookieConfig = A2_ENABLE_BYOK
      ? this.getProviderBaseUrlAndKey({
          apiKeys,
          providerSettings: providerSettings?.[this.name],
          serverEnv: serverEnv as any,
          defaultBaseUrlKey: 'OPENAI_LIKE_API_BASE_URL',
          defaultApiTokenKey: 'OPENAI_LIKE_API_KEY',
        })
      : { baseUrl: A2_LLM_BASE_URL, apiKey: undefined };

    const baseUrl = cookieConfig.baseUrl;
    const apiKey = cookieConfig.apiKey;

    if (!baseUrl) {
      throw new Error(`Missing configuration for ${this.name} provider`);
    }

    // A2: server-side calls (api.chat) must resolve the relative gateway URL to
    // an absolute one; Node fetch does not accept relative URLs. Local-only
    // deployment (NFR-04), so defaulting to the dev origin is safe.
    let resolvedBaseUrl = baseUrl;

    if (baseUrl.startsWith('/')) {
      const selfBase = ((serverEnv as any)?.A2_SELF_BASE_URL as string) || 'http://localhost:5173';
      resolvedBaseUrl = `${selfBase}${baseUrl}`;
    }

    // A2: the gateway discards the client credential and injects the platform
    // key server-side, so a placeholder keeps the SDK happy without any secret.
    // Server-side self-calls (api.chat) carry the internal token instead of a
    // session cookie, which they don't have (LG-03 exception).
    const internalToken = (serverEnv as any)?.A2_INTERNAL_TOKEN as string | undefined;
    const internalHeaders =
      baseUrl.startsWith('/') && internalToken ? { 'x-a2-internal': internalToken } : undefined;

    return getOpenAILikeModel(resolvedBaseUrl, apiKey || A2_CLIENT_KEY_PLACEHOLDER, model, internalHeaders);
  }
}
