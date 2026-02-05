/**
 * Fallback Chain Logic
 *
 * Manages an ordered chain of LLM providers. When the primary provider fails
 * (rate limit, network error, API key invalid), automatically tries the next
 * provider in the chain.
 */

import type { LLMProvider, Message, LLMResult, ProviderError } from './types';
import { callProvider, getResponseText } from './client';

export interface FallbackChainResult {
  /** The final result (success or failure) */
  result: LLMResult;
  /** Which providers were attempted (in order) */
  attemptedProviders: string[];
  /** Errors from failed providers */
  errors: ProviderError[];
}

/**
 * Determines if an error is retriable (should try next provider)
 */
function isRetriableError(error: ProviderError): boolean {
  // Auth errors mean the provider won't work, try next
  if (error.code === 'auth_error') return true;

  // Rate limits mean this provider is temporarily unavailable
  if (error.code === 'rate_limit') return true;

  // Network errors could be temporary, but try next provider anyway
  if (error.code === 'network_error') return true;

  // Invalid responses usually mean something is wrong with the provider
  if (error.code === 'invalid_response') return true;

  return false;
}

/**
 * Call LLM with fallback chain support.
 *
 * Attempts providers in order until one succeeds or all fail.
 */
export async function callWithFallback(
  chain: LLMProvider[],
  messages: Message[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  } = {}
): Promise<FallbackChainResult> {
  const attemptedProviders: string[] = [];
  const errors: ProviderError[] = [];

  for (const provider of chain) {
    // Skip disabled providers
    if (!provider.enabled) {
      continue;
    }

    attemptedProviders.push(provider.id);

    const result = await callProvider(provider, messages, options);

    if (result.success) {
      return {
        result,
        attemptedProviders,
        errors,
      };
    }

    // Record the error
    errors.push(result.error);

    // Check if we should try the next provider
    if (!isRetriableError(result.error)) {
      // Non-retriable error, stop here
      return {
        result,
        attemptedProviders,
        errors,
      };
    }

    // Log and continue to next provider
    console.log(
      `Provider ${provider.name} failed (${result.error.code}): ${result.error.message}. Trying next provider...`
    );
  }

  // All providers exhausted
  return {
    result: {
      success: false,
      error: {
        providerId: 'fallback-chain',
        code: 'unknown',
        message: `All ${attemptedProviders.length} providers failed. Errors: ${errors.map((e) => `${e.providerId}: ${e.message}`).join('; ')}`,
      },
    },
    attemptedProviders,
    errors,
  };
}

/**
 * Simple helper to call LLM and get just the text response
 */
export async function callLLM(
  chain: LLMProvider[],
  messages: Message[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ text: string; providerId: string } | { error: string }> {
  const { result } = await callWithFallback(chain, messages, options);

  if (result.success) {
    return {
      text: getResponseText(result.response),
      providerId: result.providerId,
    };
  }

  return {
    error: result.error.message,
  };
}

/**
 * Build a provider chain from configured providers.
 *
 * The chain is ordered:
 * 1. User's preferred primary provider (if set and enabled)
 * 2. Other enabled providers in their configured fallback order
 */
export function buildProviderChain(
  allProviders: LLMProvider[],
  primaryProviderId?: string
): LLMProvider[] {
  const enabledProviders = allProviders.filter((p) => p.enabled);

  if (!primaryProviderId) {
    return enabledProviders;
  }

  const primary = enabledProviders.find((p) => p.id === primaryProviderId);
  const others = enabledProviders.filter((p) => p.id !== primaryProviderId);

  if (primary) {
    return [primary, ...others];
  }

  return enabledProviders;
}
