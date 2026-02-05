/**
 * LLM Provider Registry
 *
 * Contains configurations for all known LLM providers.
 * Providers are organized by tier: paid, free, and local.
 */

import type { ProviderConfig, ProviderTier } from './types';

/**
 * All known provider configurations.
 * Users select from these in Settings and configure their API keys.
 */
export const PROVIDER_CONFIGS: ProviderConfig[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // PAID TIER - Best quality, user brings own API key
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    baseURL: 'https://api.anthropic.com/v1',
    defaultModel: 'claude-sonnet-4-5-20250514',
    tier: 'paid',
    requiresApiKey: true,
    models: [
      'claude-sonnet-4-5-20250514',
      'claude-opus-4-20250514',
      'claude-3-5-haiku-20241022',
    ],
    description: 'Best instruction following, teaching personality',
    supportsVision: true,
    customHeaders: {
      'anthropic-version': '2023-06-01',
    },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o',
    tier: 'paid',
    requiresApiKey: true,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.1'],
    description: 'Strong general reasoning',
    supportsVision: true,
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-pro-preview-05-06',
    tier: 'paid',
    requiresApiKey: true,
    models: ['gemini-2.5-pro-preview-05-06', 'gemini-2.0-flash'],
    description: 'Long context, multimodal fallback',
    supportsVision: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    tier: 'paid',
    requiresApiKey: true,
    models: ['deepseek-chat', 'deepseek-reasoner'],
    description: 'High quality, very cheap ($0.27/M input)',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    baseURL: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest',
    tier: 'paid',
    requiresApiKey: true,
    models: ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
    description: 'Good European option, fast',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FREE TIER - No API key needed or free sign-up, rate-limited
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'groq',
    name: 'Groq',
    baseURL: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    tier: 'free',
    requiresApiKey: true, // Free but requires signup
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'gemma2-9b-it',
      'mixtral-8x7b-32768',
    ],
    rateLimit: {
      requestsPerMin: 30,
      tokensPerMin: 15000,
    },
    description: 'Fast inference, generous free tier (14,400 req/day)',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
    tier: 'free',
    requiresApiKey: true, // Free but requires signup
    models: [
      'meta-llama/llama-3.3-70b-instruct:free',
      'google/gemma-3-27b-it:free',
      'qwen/qwen-2.5-72b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ],
    rateLimit: {
      requestsPerMin: 20,
      tokensPerMin: 10000,
    },
    description: '30+ free models (50 req/day free, 1000/day with $10 credit)',
    customHeaders: {
      'HTTP-Referer': 'https://screentutor.app',
      'X-Title': 'ScreenTutor',
    },
  },
  {
    id: 'google-ai-studio',
    name: 'Google AI Studio',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.0-flash',
    tier: 'free',
    requiresApiKey: true, // Free but requires API key
    models: ['gemini-2.0-flash', 'gemini-1.5-flash'],
    description: 'Generous free quota',
    supportsVision: true,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCAL TIER - Fully offline, no internet, no cost
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'llama3.3:8b',
    tier: 'local',
    requiresApiKey: false,
    models: [
      'llama3.3:8b',
      'llama3.3:70b',
      'mistral:7b',
      'qwen2.5:7b',
      'deepseek-r1:7b',
    ],
    description: 'Fully local, no internet needed',
  },
  {
    id: 'lmstudio',
    name: 'LM Studio (Local)',
    baseURL: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    tier: 'local',
    requiresApiKey: false,
    models: ['local-model'],
    description: 'GUI app, drag-and-drop model loading',
  },
];

/**
 * Get all providers of a specific tier
 */
export function getProvidersByTier(tier: ProviderTier): ProviderConfig[] {
  return PROVIDER_CONFIGS.filter((p) => p.tier === tier);
}

/**
 * Get a provider config by ID
 */
export function getProviderById(id: string): ProviderConfig | undefined {
  return PROVIDER_CONFIGS.find((p) => p.id === id);
}

/**
 * Get all paid providers
 */
export function getPaidProviders(): ProviderConfig[] {
  return getProvidersByTier('paid');
}

/**
 * Get all free providers
 */
export function getFreeProviders(): ProviderConfig[] {
  return getProvidersByTier('free');
}

/**
 * Get all local providers
 */
export function getLocalProviders(): ProviderConfig[] {
  return getProvidersByTier('local');
}

/**
 * Default fallback order for providers
 */
export const DEFAULT_FALLBACK_ORDER = [
  'groq',
  'openrouter',
  'google-ai-studio',
  'ollama',
];
