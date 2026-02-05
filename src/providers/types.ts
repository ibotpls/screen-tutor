/**
 * LLM Provider System - Type Definitions
 *
 * All major LLM providers support the OpenAI chat completions format.
 * This module defines the core interfaces for provider-agnostic LLM access.
 */

export type ProviderTier = 'paid' | 'free' | 'local';

export interface LLMProvider {
  /** Unique identifier for this provider */
  id: string;
  /** Display name */
  name: string;
  /** Base URL for API requests */
  baseURL: string;
  /** API key (empty for free/local providers that don't require one) */
  apiKey: string;
  /** Model identifier */
  model: string;
  /** Provider tier classification */
  tier: ProviderTier;
  /** Maximum tokens for responses */
  maxTokens?: number;
  /** Rate limiting configuration */
  rateLimit?: {
    requestsPerMin: number;
    tokensPerMin: number;
  };
  /** Whether this provider is currently enabled */
  enabled: boolean;
  /** Custom headers required by some providers */
  customHeaders?: Record<string, string>;
}

export type MessageRole = 'system' | 'user' | 'assistant';

/** A text content part in a multimodal message */
export interface TextContentPart {
  type: 'text';
  text: string;
}

/** An image content part in a multimodal message */
export interface ImageContentPart {
  type: 'image';
  /** Base64-encoded image data (no data URL prefix) */
  data: string;
  /** MIME type, defaults to 'image/png' */
  mediaType?: string;
}

/** A single content part in a multimodal message */
export type ContentPart = TextContentPart | ImageContentPart;

/** Message content: plain string for text-only, or array of parts for multimodal */
export type MessageContent = string | ContentPart[];

export interface Message {
  role: MessageRole;
  content: MessageContent;
}

export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface ChatCompletionChoice {
  index: number;
  message: Message;
  finish_reason: string | null;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

export interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs?: number;
  lastChecked: number;
  error?: string;
}

export interface ProviderError {
  providerId: string;
  code: 'rate_limit' | 'auth_error' | 'network_error' | 'invalid_response' | 'unknown';
  message: string;
  retryAfterMs?: number;
}

/** Result from an LLM call attempt */
export type LLMResult =
  | { success: true; response: ChatCompletionResponse; providerId: string }
  | { success: false; error: ProviderError };

/** Provider configuration for the registry */
export interface ProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  defaultModel: string;
  tier: ProviderTier;
  requiresApiKey: boolean;
  models: string[];
  rateLimit?: {
    requestsPerMin: number;
    tokensPerMin: number;
  };
  customHeaders?: Record<string, string>;
  description: string;
  /** Whether this provider's default models support vision/image input */
  supportsVision?: boolean;
}
