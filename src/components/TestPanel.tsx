/**
 * TestPanel Component
 *
 * TEMPORARY component for testing the LLM provider chain.
 * Allows sending a message to the active LLM provider and displays the response.
 * This proves the full chain works: provider selection → API key → fallback → LLM call → response.
 *
 * TODO: Remove this component once the main chat interface is built.
 */

import { useState, useEffect } from 'react';
import { useProviderStore } from '../store/provider-store';
import { callWithFallback } from '../providers/fallback';
import { getResponseText } from '../providers/client';
import { detectLocalProviders } from '../providers/health';
import type { Message } from '../providers/types';
import './TestPanel.css';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  providerId?: string;
}

export function TestPanel() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<{ ollama: boolean; lmstudio: boolean }>({
    ollama: false,
    lmstudio: false,
  });

  const getProviderChain = useProviderStore((state) => state.getProviderChain);

  // Check for local providers on mount
  useEffect(() => {
    detectLocalProviders().then(setLocalStatus);
  }, []);

  // Check if we have any usable providers
  const chain = getProviderChain();
  const hasCloudProvider = chain.some((p) => p.tier !== 'local' && p.apiKey);
  const hasLocalProvider = chain.some(
    (p) => p.tier === 'local' && ((p.id === 'ollama' && localStatus.ollama) || (p.id === 'lmstudio' && localStatus.lmstudio))
  );
  const hasUsableProvider = hasCloudProvider || hasLocalProvider;

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    // Add user message to conversation
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    setIsLoading(true);

    try {
      const chain = getProviderChain();

      if (chain.length === 0) {
        setError('No providers configured. Please add an API key or enable a local provider in Settings.');
        setIsLoading(false);
        return;
      }

      // Build message history for context
      const apiMessages: Message[] = [
        {
          role: 'system',
          content:
            'You are ScreenTutor, an AI assistant that helps users learn digital audio workstations (DAWs). Be helpful, concise, and friendly.',
        },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMessage },
      ];

      const { result, attemptedProviders, errors } = await callWithFallback(chain, apiMessages);

      if (result.success) {
        const responseText = getResponseText(result.response);
        setLastProvider(result.providerId);
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: responseText, providerId: result.providerId },
        ]);
      } else {
        setError(
          `All providers failed.\nAttempted: ${attemptedProviders.join(' → ')}\nErrors:\n${errors.map((e) => `  ${e.providerId}: ${e.message}`).join('\n')}`
        );
      }
    } catch (err) {
      setError(`Unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
    setLastProvider(null);
  };

  const enabledCount = chain.length;

  return (
    <div className="test-panel">
      <div className="test-panel-header">
        <h3>LLM Test Panel</h3>
        <span className="provider-info">
          {enabledCount} provider{enabledCount !== 1 ? 's' : ''} enabled
          {lastProvider && ` · Last: ${lastProvider}`}
        </span>
      </div>

      <div className="messages-container">
        {messages.length === 0 && !hasUsableProvider && (
          <div className="empty-state setup-needed">
            <p className="warning-icon">⚠️</p>
            <p><strong>No providers configured</strong></p>
            <p className="hint">
              Go to <strong>Settings</strong> and add an API key for a cloud provider, or start Ollama locally.
            </p>
            <div className="quick-links">
              <p>Free API keys:</p>
              <ul>
                <li><a href="https://console.groq.com/keys" target="_blank" rel="noopener">Groq</a> - Fast, generous free tier</li>
                <li><a href="https://openrouter.ai/keys" target="_blank" rel="noopener">OpenRouter</a> - 30+ free models</li>
                <li><a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a> - Gemini free tier</li>
              </ul>
            </div>
          </div>
        )}

        {messages.length === 0 && hasUsableProvider && (
          <div className="empty-state">
            <p>Send a message to test the LLM provider chain.</p>
            <p className="hint">
              The message will be sent to your configured providers in order until one succeeds.
            </p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.role}`}>
            <div className="message-header">
              <span className="role">{msg.role === 'user' ? 'You' : 'Assistant'}</span>
              {msg.providerId && <span className="provider-tag">via {msg.providerId}</span>}
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        ))}

        {isLoading && (
          <div className="message assistant loading">
            <div className="message-header">
              <span className="role">Assistant</span>
            </div>
            <div className="message-content">
              <span className="typing-indicator">Thinking...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <pre>{error}</pre>
          </div>
        )}
      </div>

      <div className="input-area">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message to test the LLM chain..."
          disabled={isLoading}
          rows={2}
        />
        <div className="input-actions">
          <button onClick={handleClear} disabled={isLoading || messages.length === 0} className="secondary">
            Clear
          </button>
          <button onClick={handleSend} disabled={isLoading || !input.trim()}>
            {isLoading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
