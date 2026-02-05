/**
 * OpenAI-Compatible API Client
 *
 * Provides a unified interface for calling any LLM provider that supports
 * the OpenAI chat completions format. Handles authentication, request
 * formatting, response parsing, and multimodal (image) content.
 */

import type {
  LLMProvider,
  Message,
  MessageContent,
  ChatCompletionResponse,
  LLMResult,
  ProviderError,
} from './types';
import { getProviderById } from './registry';

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_TOKENS = 2048;

/**
 * Anthropic has a different API format, so we need to transform requests
 */
function isAnthropicProvider(provider: LLMProvider): boolean {
  return provider.id === 'anthropic';
}

/**
 * Extract plain text from MessageContent (for contexts that need a string)
 */
function getTextContent(content: MessageContent): string {
  if (typeof content === 'string') return content;
  return content
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('\n');
}

/**
 * Convert provider-agnostic MessageContent to OpenAI format.
 * OpenAI (and compatible APIs like Groq, OpenRouter, Ollama) use:
 *   { type: 'text', text: '...' }
 *   { type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }
 */
function toOpenAIContent(content: MessageContent): string | Array<Record<string, unknown>> {
  if (typeof content === 'string') return content;

  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }
    const mediaType = part.mediaType || 'image/png';
    return {
      type: 'image_url',
      image_url: { url: `data:${mediaType};base64,${part.data}` },
    };
  });
}

/**
 * Convert provider-agnostic MessageContent to Anthropic format.
 * Anthropic uses:
 *   { type: 'text', text: '...' }
 *   { type: 'image', source: { type: 'base64', media_type: 'image/png', data: '...' } }
 */
function toAnthropicContent(content: MessageContent): string | Array<Record<string, unknown>> {
  if (typeof content === 'string') return content;

  return content.map((part) => {
    if (part.type === 'text') {
      return { type: 'text', text: part.text };
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: part.mediaType || 'image/png',
        data: part.data,
      },
    };
  });
}

/**
 * Transform messages for Anthropic's API format
 */
function transformForAnthropic(
  messages: Message[],
  maxTokens: number
): { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: unknown }>; max_tokens: number } {
  const systemMessage = messages.find((m) => m.role === 'system');
  const nonSystemMessages = messages.filter((m) => m.role !== 'system');

  return {
    ...(systemMessage && { system: getTextContent(systemMessage.content) }),
    messages: nonSystemMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: toAnthropicContent(m.content),
    })),
    max_tokens: maxTokens,
  };
}

/**
 * Build request headers for a provider
 */
function buildHeaders(provider: LLMProvider): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add authorization header
  if (provider.apiKey) {
    if (isAnthropicProvider(provider)) {
      headers['x-api-key'] = provider.apiKey;
    } else {
      headers['Authorization'] = `Bearer ${provider.apiKey}`;
    }
  }

  // Add any custom headers the provider requires
  if (provider.customHeaders) {
    Object.assign(headers, provider.customHeaders);
  }

  // Add custom headers from the provider config
  const config = getProviderById(provider.id);
  if (config?.customHeaders) {
    Object.assign(headers, config.customHeaders);
  }

  return headers;
}

/**
 * Build the request body for a chat completion
 */
function buildRequestBody(
  provider: LLMProvider,
  messages: Message[],
  options: { maxTokens?: number; temperature?: number } = {}
): string {
  const maxTokens = options.maxTokens ?? provider.maxTokens ?? DEFAULT_MAX_TOKENS;

  if (isAnthropicProvider(provider)) {
    const body = {
      model: provider.model,
      ...transformForAnthropic(messages, maxTokens),
      ...(options.temperature !== undefined && { temperature: options.temperature }),
    };
    return JSON.stringify(body);
  }

  // OpenAI-compatible format (OpenAI, Google, Groq, OpenRouter, Ollama, etc.)
  const body = {
    model: provider.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: toOpenAIContent(m.content),
    })),
    max_tokens: maxTokens,
    ...(options.temperature !== undefined && { temperature: options.temperature }),
  };

  return JSON.stringify(body);
}

/**
 * Get the correct endpoint URL for a provider
 */
function getEndpointUrl(provider: LLMProvider): string {
  if (isAnthropicProvider(provider)) {
    return `${provider.baseURL}/messages`;
  }
  return `${provider.baseURL}/chat/completions`;
}

/**
 * Parse error response to determine error type
 */
function parseError(
  provider: LLMProvider,
  status: number,
  errorBody: unknown
): ProviderError {
  const baseError: ProviderError = {
    providerId: provider.id,
    code: 'unknown',
    message: 'Unknown error occurred',
  };

  if (status === 401 || status === 403) {
    return {
      ...baseError,
      code: 'auth_error',
      message: 'Invalid API key or unauthorized access',
    };
  }

  if (status === 429) {
    const retryAfter =
      typeof errorBody === 'object' && errorBody !== null && 'retry_after' in errorBody
        ? (errorBody as { retry_after?: number }).retry_after
        : undefined;

    return {
      ...baseError,
      code: 'rate_limit',
      message: 'Rate limit exceeded',
      retryAfterMs: retryAfter ? retryAfter * 1000 : 60000,
    };
  }

  if (status >= 500) {
    return {
      ...baseError,
      code: 'network_error',
      message: `Server error: ${status}`,
    };
  }

  // Try to extract error message from response
  let message = `Request failed with status ${status}`;
  if (typeof errorBody === 'object' && errorBody !== null) {
    const body = errorBody as Record<string, unknown>;
    if (typeof body.error === 'object' && body.error !== null) {
      const error = body.error as Record<string, unknown>;
      if (typeof error.message === 'string') {
        message = error.message;
      }
    } else if (typeof body.message === 'string') {
      message = body.message;
    }
  }

  return {
    ...baseError,
    code: 'invalid_response',
    message,
  };
}

/**
 * Transform Anthropic response to OpenAI format
 */
function transformAnthropicResponse(response: unknown): ChatCompletionResponse {
  const r = response as {
    id: string;
    content: Array<{ type: string; text: string }>;
    model: string;
    stop_reason: string;
    usage: { input_tokens: number; output_tokens: number };
  };

  const textContent = r.content.find((c) => c.type === 'text');

  return {
    id: r.id,
    object: 'chat.completion',
    created: Date.now(),
    model: r.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent?.text ?? '',
        },
        finish_reason: r.stop_reason,
      },
    ],
    usage: {
      prompt_tokens: r.usage.input_tokens,
      completion_tokens: r.usage.output_tokens,
      total_tokens: r.usage.input_tokens + r.usage.output_tokens,
    },
  };
}

/**
 * Call an LLM provider with the given messages
 */
export async function callProvider(
  provider: LLMProvider,
  messages: Message[],
  options: {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
  } = {}
): Promise<LLMResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(getEndpointUrl(provider), {
      method: 'POST',
      headers: buildHeaders(provider),
      body: buildRequestBody(provider, messages, options),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = await response.text();
      }
      return {
        success: false,
        error: parseError(provider, response.status, errorBody),
      };
    }

    const data = await response.json();

    // Transform Anthropic response if needed
    const normalizedResponse = isAnthropicProvider(provider)
      ? transformAnthropicResponse(data)
      : (data as ChatCompletionResponse);

    return {
      success: true,
      response: normalizedResponse,
      providerId: provider.id,
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: {
            providerId: provider.id,
            code: 'network_error',
            message: `Request timed out after ${timeoutMs}ms`,
          },
        };
      }

      return {
        success: false,
        error: {
          providerId: provider.id,
          code: 'network_error',
          message: error.message,
        },
      };
    }

    return {
      success: false,
      error: {
        providerId: provider.id,
        code: 'unknown',
        message: 'Unknown error occurred',
      },
    };
  }
}

/**
 * Simple helper to extract the assistant's message text from a successful response
 */
export function getResponseText(response: ChatCompletionResponse): string {
  const content = response.choices[0]?.message?.content ?? '';
  return typeof content === 'string' ? content : '';
}
