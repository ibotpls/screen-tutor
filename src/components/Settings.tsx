/**
 * Settings Component
 *
 * Provider selection, API key configuration, and connection testing.
 */

import { useState, useEffect } from 'react';
import { useProviderStore } from '../store/provider-store';
import { PROVIDER_CONFIGS, getProviderById } from '../providers/registry';
import { detectLocalProviders, checkProviderHealth } from '../providers/health';
import './Settings.css';

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface ProviderTestState {
  status: TestStatus;
  message?: string;
}

export function Settings() {
  const {
    providers,
    primaryProviderId,
    setApiKey,
    setProviderEnabled,
    setPrimaryProvider,
    setProviderModel,
    healthStatus,
    updateHealthStatus,
  } = useProviderStore();

  const [testStates, setTestStates] = useState<Record<string, ProviderTestState>>({});
  const [localProviders, setLocalProviders] = useState<{ ollama: boolean; lmstudio: boolean }>({
    ollama: false,
    lmstudio: false,
  });
  // Detect local providers on mount
  useEffect(() => {
    detectLocalProviders().then(setLocalProviders);
  }, []);

  const handleTestConnection = async (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;

    setTestStates((prev) => ({
      ...prev,
      [providerId]: { status: 'testing' },
    }));

    const health = await checkProviderHealth(provider);

    // Update health status in store
    const newHealthStatus = new Map(healthStatus);
    newHealthStatus.set(providerId, health);
    updateHealthStatus(newHealthStatus);

    setTestStates((prev) => ({
      ...prev,
      [providerId]: {
        status: health.status === 'healthy' || health.status === 'degraded' ? 'success' : 'error',
        message:
          health.status === 'healthy'
            ? `Connected! Latency: ${health.latencyMs}ms`
            : health.status === 'degraded'
              ? `Working but slow (${health.latencyMs}ms)`
              : health.error ?? 'Connection failed',
      },
    }));
  };

  const getStatusIndicator = (providerId: string): string => {
    const health = healthStatus.get(providerId);
    if (!health) return '⚪'; // Unknown
    switch (health.status) {
      case 'healthy':
        return '🟢';
      case 'degraded':
        return '🟡';
      case 'unhealthy':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getTierLabel = (tier: string): string => {
    switch (tier) {
      case 'paid':
        return 'Paid';
      case 'free':
        return 'Free';
      case 'local':
        return 'Local';
      default:
        return tier;
    }
  };

  const renderProviderCard = (providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    const config = getProviderById(providerId);
    if (!provider || !config) return null;

    const testState = testStates[providerId] ?? { status: 'idle' };
    const isLocal = provider.tier === 'local';
    const isLocalAvailable =
      providerId === 'ollama' ? localProviders.ollama : providerId === 'lmstudio' ? localProviders.lmstudio : true;

    return (
      <div key={providerId} className={`provider-card ${provider.enabled ? 'enabled' : 'disabled'}`}>
        <div className="provider-header">
          <div className="provider-info">
            <span className="status-indicator">{getStatusIndicator(providerId)}</span>
            <h3>{config.name}</h3>
            <span className={`tier-badge tier-${provider.tier}`}>{getTierLabel(provider.tier)}</span>
            {primaryProviderId === providerId && <span className="primary-badge">Primary</span>}
          </div>
          <label className="toggle">
            <input
              type="checkbox"
              checked={provider.enabled}
              onChange={(e) => setProviderEnabled(providerId, e.target.checked)}
              disabled={isLocal && !isLocalAvailable}
            />
            <span className="slider"></span>
          </label>
        </div>

        <p className="provider-description">{config.description}</p>

        {isLocal && !isLocalAvailable && (
          <p className="local-warning">
            Not running. Start {config.name} at {provider.baseURL}
          </p>
        )}

        {!isLocal && config.requiresApiKey && (
          <div className="api-key-input">
            <input
              type="password"
              placeholder="Enter API key"
              value={provider.apiKey}
              onChange={(e) => setApiKey(providerId, e.target.value)}
            />
          </div>
        )}

        <div className="provider-model">
          <label>Model:</label>
          <select value={provider.model} onChange={(e) => setProviderModel(providerId, e.target.value)}>
            {config.models.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        <div className="provider-actions">
          <button
            onClick={() => handleTestConnection(providerId)}
            disabled={testState.status === 'testing' || (!isLocal && !provider.apiKey)}
          >
            {testState.status === 'testing' ? 'Testing...' : 'Test Connection'}
          </button>
          {primaryProviderId !== providerId && provider.enabled && (
            <button className="secondary" onClick={() => setPrimaryProvider(providerId)}>
              Set as Primary
            </button>
          )}
        </div>

        {testState.message && (
          <p className={`test-result ${testState.status}`}>{testState.message}</p>
        )}
      </div>
    );
  };

  const paidProviders = PROVIDER_CONFIGS.filter((c) => c.tier === 'paid');
  const freeProviders = PROVIDER_CONFIGS.filter((c) => c.tier === 'free');
  const localProviderConfigs = PROVIDER_CONFIGS.filter((c) => c.tier === 'local');

  return (
    <div className="settings">
      <h2>LLM Provider Settings</h2>
      <p className="settings-description">
        Configure your AI providers. The app will try providers in order until one succeeds.
      </p>

      <section className="provider-section">
        <h3>Paid Providers</h3>
        <p className="section-description">Best quality. Requires your own API key.</p>
        <div className="provider-grid">
          {paidProviders.map((c) => renderProviderCard(c.id))}
        </div>
      </section>

      <section className="provider-section">
        <h3>Free Providers</h3>
        <p className="section-description">Free tier with rate limits. Sign up for an API key.</p>
        <div className="provider-grid">
          {freeProviders.map((c) => renderProviderCard(c.id))}
        </div>
      </section>

      <section className="provider-section">
        <h3>Local Providers</h3>
        <p className="section-description">
          Run models on your own hardware. No internet required.
          {localProviders.ollama && ' Ollama detected!'}
          {localProviders.lmstudio && ' LM Studio detected!'}
        </p>
        <div className="provider-grid">
          {localProviderConfigs.map((c) => renderProviderCard(c.id))}
        </div>
      </section>

    </div>
  );
}
