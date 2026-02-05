/**
 * Provider Health Checking
 *
 * Handles health checking for LLM providers, including:
 * - Testing API key validity
 * - Checking if local providers (Ollama, LM Studio) are running
 * - Measuring response latency
 * - Auto-detecting available providers
 */

import type { LLMProvider, ProviderHealth } from './types';
import { callProvider } from './client';

const HEALTH_CHECK_TIMEOUT_MS = 10000;

/**
 * Simple test message to verify provider connectivity
 */
const TEST_MESSAGES = [
  { role: 'user' as const, content: 'Say "OK" and nothing else.' },
];

/**
 * Check if a local provider (Ollama, LM Studio) is running
 */
export async function checkLocalProviderRunning(baseURL: string): Promise<boolean> {
  try {
    // Try to fetch the models list endpoint (works for both Ollama and LM Studio)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseURL}/models`, {
      method: 'GET',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Check health of a specific provider
 */
export async function checkProviderHealth(provider: LLMProvider): Promise<ProviderHealth> {
  const startTime = Date.now();

  // For local providers, first check if they're running
  if (provider.tier === 'local') {
    const isRunning = await checkLocalProviderRunning(provider.baseURL);
    if (!isRunning) {
      return {
        providerId: provider.id,
        status: 'unhealthy',
        lastChecked: Date.now(),
        error: `${provider.name} is not running at ${provider.baseURL}`,
      };
    }
  }

  // For providers requiring API keys, check if one is configured
  if (provider.tier !== 'local' && !provider.apiKey) {
    return {
      providerId: provider.id,
      status: 'unknown',
      lastChecked: Date.now(),
      error: 'No API key configured',
    };
  }

  // Try a simple test call
  const result = await callProvider(provider, TEST_MESSAGES, {
    maxTokens: 10,
    timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
  });

  const latencyMs = Date.now() - startTime;

  if (result.success) {
    return {
      providerId: provider.id,
      status: latencyMs > 5000 ? 'degraded' : 'healthy',
      latencyMs,
      lastChecked: Date.now(),
    };
  }

  // Determine status based on error type
  let status: ProviderHealth['status'] = 'unhealthy';
  if (result.error.code === 'rate_limit') {
    status = 'degraded';
  }

  return {
    providerId: provider.id,
    status,
    latencyMs,
    lastChecked: Date.now(),
    error: result.error.message,
  };
}

/**
 * Check health of multiple providers in parallel
 */
export async function checkAllProvidersHealth(
  providers: LLMProvider[]
): Promise<Map<string, ProviderHealth>> {
  const results = await Promise.all(
    providers.map(async (provider) => {
      const health = await checkProviderHealth(provider);
      return [provider.id, health] as const;
    })
  );

  return new Map(results);
}

/**
 * Auto-detect available local providers
 */
export async function detectLocalProviders(): Promise<{
  ollama: boolean;
  lmstudio: boolean;
}> {
  const [ollamaRunning, lmstudioRunning] = await Promise.all([
    checkLocalProviderRunning('http://localhost:11434/v1'),
    checkLocalProviderRunning('http://localhost:1234/v1'),
  ]);

  return {
    ollama: ollamaRunning,
    lmstudio: lmstudioRunning,
  };
}

/**
 * Get available models from Ollama
 */
export async function getOllamaModels(): Promise<string[]> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) return [];

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    return data.models?.map((m) => m.name) ?? [];
  } catch {
    return [];
  }
}

/**
 * Validate an API key by making a test request
 */
export async function validateApiKey(provider: LLMProvider): Promise<{
  valid: boolean;
  error?: string;
}> {
  if (!provider.apiKey) {
    return { valid: false, error: 'No API key provided' };
  }

  const result = await callProvider(provider, TEST_MESSAGES, {
    maxTokens: 10,
    timeoutMs: HEALTH_CHECK_TIMEOUT_MS,
  });

  if (result.success) {
    return { valid: true };
  }

  if (result.error.code === 'auth_error') {
    return { valid: false, error: 'Invalid API key' };
  }

  // Rate limit or other errors don't mean the key is invalid
  if (result.error.code === 'rate_limit') {
    return { valid: true };
  }

  return { valid: false, error: result.error.message };
}
