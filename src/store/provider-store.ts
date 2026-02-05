/**
 * Provider Store
 *
 * Zustand store for managing LLM provider configuration and state.
 * Handles persistence to localStorage for user settings.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LLMProvider, ProviderHealth } from '../providers/types';
import { PROVIDER_CONFIGS, DEFAULT_FALLBACK_ORDER } from '../providers/registry';
import { buildProviderChain } from '../providers/fallback';

interface ProviderStore {
  /** Configured providers with user settings (API keys, enabled state) */
  providers: LLMProvider[];

  /** ID of the primary provider (first in fallback chain) */
  primaryProviderId: string | null;

  /** Custom fallback order (provider IDs) */
  fallbackOrder: string[];

  /** Health status for each provider */
  healthStatus: Map<string, ProviderHealth>;

  /** Actions */
  setApiKey: (providerId: string, apiKey: string) => void;
  setProviderEnabled: (providerId: string, enabled: boolean) => void;
  setPrimaryProvider: (providerId: string | null) => void;
  setFallbackOrder: (order: string[]) => void;
  updateHealthStatus: (health: Map<string, ProviderHealth>) => void;
  setProviderModel: (providerId: string, model: string) => void;

  /** Computed */
  getProviderChain: () => LLMProvider[];
  getProvider: (providerId: string) => LLMProvider | undefined;
}

/**
 * Initialize providers from the registry with default values
 */
function initializeProviders(): LLMProvider[] {
  return PROVIDER_CONFIGS.map((config) => ({
    id: config.id,
    name: config.name,
    baseURL: config.baseURL,
    apiKey: '',
    model: config.defaultModel,
    tier: config.tier,
    maxTokens: 2048,
    rateLimit: config.rateLimit,
    enabled: config.tier === 'local', // Local providers enabled by default
    customHeaders: config.customHeaders,
  }));
}

export const useProviderStore = create<ProviderStore>()(
  persist(
    (set, get) => ({
      providers: initializeProviders(),
      primaryProviderId: null,
      fallbackOrder: DEFAULT_FALLBACK_ORDER,
      healthStatus: new Map(),

      setApiKey: (providerId, apiKey) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId ? { ...p, apiKey, enabled: apiKey.length > 0 || p.tier === 'local' } : p
          ),
        })),

      setProviderEnabled: (providerId, enabled) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId ? { ...p, enabled } : p
          ),
        })),

      setPrimaryProvider: (providerId) =>
        set({ primaryProviderId: providerId }),

      setFallbackOrder: (order) =>
        set({ fallbackOrder: order }),

      updateHealthStatus: (health) =>
        set({ healthStatus: health }),

      setProviderModel: (providerId, model) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === providerId ? { ...p, model } : p
          ),
        })),

      getProviderChain: () => {
        const { providers, primaryProviderId, fallbackOrder } = get();

        // Sort providers by fallback order
        const sortedProviders = [...providers].sort((a, b) => {
          const aIndex = fallbackOrder.indexOf(a.id);
          const bIndex = fallbackOrder.indexOf(b.id);
          // Providers not in fallback order go to the end
          const aOrder = aIndex === -1 ? 999 : aIndex;
          const bOrder = bIndex === -1 ? 999 : bIndex;
          return aOrder - bOrder;
        });

        return buildProviderChain(sortedProviders, primaryProviderId ?? undefined);
      },

      getProvider: (providerId) => {
        return get().providers.find((p) => p.id === providerId);
      },
    }),
    {
      name: 'screen-tutor-providers',
      partialize: (state) => ({
        providers: state.providers,
        primaryProviderId: state.primaryProviderId,
        fallbackOrder: state.fallbackOrder,
      }),
    }
  )
);
