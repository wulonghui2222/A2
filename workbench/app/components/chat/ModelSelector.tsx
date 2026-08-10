import type { ProviderInfo } from '~/types/model';
import { useEffect } from 'react';
import type { ModelInfo } from '~/lib/modules/llm/types';
import { A2_DEFAULT_MODEL, A2_ENABLE_PROVIDER_SWITCH, A2_PLATFORM_PROVIDER } from '~/a2/config';

interface ModelSelectorProps {
  model?: string;
  setModel?: (model: string) => void;
  provider?: ProviderInfo;
  setProvider?: (provider: ProviderInfo) => void;
  modelList: ModelInfo[];
  providerList: ProviderInfo[];
  apiKeys: Record<string, string>;
  modelLoading?: string;
}

export const ModelSelector = ({
  model,
  setModel,
  provider,
  setProvider,
  modelList,
  providerList,
  modelLoading,
}: ModelSelectorProps) => {
  // Load enabled providers from cookies

  // Update enabled providers when cookies change
  useEffect(() => {
    // If current provider is disabled, switch to first enabled provider
    if (providerList.length == 0) {
      return;
    }

    if (provider && !providerList.map((p) => p.name).includes(provider.name)) {
      const firstEnabledProvider = providerList[0];
      setProvider?.(firstEnabledProvider);

      // Also update the model to the first available one for the new provider
      const firstModel = modelList.find((m) => m.provider === firstEnabledProvider.name);

      if (firstModel) {
        setModel?.(firstModel.name);
      }
    }
  }, [providerList, provider, setProvider, modelList, setModel]);

  // A2 (design D6 / LG-04, tasks 6.1/6.3): with the provider switch disabled,
  // only the platform provider and its default model are presented; the upstream
  // selection UI is kept in place behind the constants.
  const visibleProviderList = A2_ENABLE_PROVIDER_SWITCH
    ? providerList
    : providerList.filter((p) => p.name === A2_PLATFORM_PROVIDER);
  const visibleModelList = A2_ENABLE_PROVIDER_SWITCH
    ? modelList
    : modelList.filter((m) => m.provider === A2_PLATFORM_PROVIDER && m.name === A2_DEFAULT_MODEL);

  // A2 (design D6 / LG-04, task 6.3): with the switch off there is exactly one
  // platform model (the A2_DEFAULT_MODEL default), so the whole selector box is
  // hidden; chat state still defaults to provider OpenAILike + that model.
  if (!A2_ENABLE_PROVIDER_SWITCH) {
    return null;
  }

  if (visibleProviderList.length === 0) {
    return (
      <div className="mb-2 p-4 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textPrimary">
        <p className="text-center">
          No providers are currently enabled. Please enable at least one provider in the settings to start using the
          chat.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-2 flex gap-2 flex-col sm:flex-row">
      {A2_ENABLE_PROVIDER_SWITCH && (
        <select
          value={provider?.name ?? ''}
          onChange={(e) => {
            const newProvider = providerList.find((p: ProviderInfo) => p.name === e.target.value);

            if (newProvider && setProvider) {
              setProvider(newProvider);
            }

            const firstModel = [...modelList].find((m) => m.provider === e.target.value);

            if (firstModel && setModel) {
              setModel(firstModel.name);
            }
          }}
          className="flex-1 p-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus transition-all"
        >
          {visibleProviderList.map((provider: ProviderInfo) => (
            <option key={provider.name} value={provider.name}>
              {provider.name}
            </option>
          ))}
        </select>
      )}
      <select
        key={provider?.name}
        value={model}
        onChange={(e) => setModel?.(e.target.value)}
        className="flex-1 p-2 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-prompt-background text-bolt-elements-textPrimary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus transition-all lg:max-w-[70%]"
        disabled={modelLoading === 'all' || modelLoading === provider?.name}
      >
        {modelLoading == 'all' || modelLoading == provider?.name ? (
          <option key={0} value="">
            Loading...
          </option>
        ) : (
          [...visibleModelList]
            .filter((e) => e.provider == provider?.name && e.name)
            .map((modelOption, index) => (
              <option key={index} value={modelOption.name}>
                {modelOption.label}
              </option>
            ))
        )}
      </select>
    </div>
  );
};
