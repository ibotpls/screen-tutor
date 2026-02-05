/**
 * Screen Test Panel
 *
 * Test panel for the screenshot → cloud LLM pipeline.
 * Captures screenshots and sends them directly to the configured LLM provider.
 *
 * TODO: Remove this component once the main chat interface is built.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getCaptureManager, listScreens, setCaptureConfig } from '../vision/capture';
import type { Screenshot, ScreenInfo } from '../vision/types';
import { useProviderStore } from '../store/provider-store';
import { callWithFallback } from '../providers/fallback';
import { getResponseText } from '../providers/client';
import { getProviderById } from '../providers/registry';
import type { Message, LLMProvider } from '../providers/types';
import './VisionDebugPanel.css';

export function VisionDebugPanel() {
  const [isCapturing, setIsCapturing] = useState(false);
  const [screenshot, setScreenshot] = useState<Screenshot | null>(null);
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [selectedScreen, setSelectedScreen] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [llmResponse, setLlmResponse] = useState<string | null>(null);
  const [lastProvider, setLastProvider] = useState<string | null>(null);
  const [autoAnalyze, setAutoAnalyze] = useState(false);
  const [captureInterval, setCaptureIntervalMs] = useState(2000);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({
    captureCount: 0,
    changeCount: 0,
    analyzeCount: 0,
    lastAnalyzeTime: 0,
  });

  const { getProviderChain } = useProviderStore();

  // Refs to hold latest callbacks — prevents useEffect from re-running and killing the capture loop
  const onCaptureRef = useRef<(shot: Screenshot) => void>(() => {});
  const onErrorRef = useRef<(err: Error) => void>(() => {});
  const autoAnalyzeRef = useRef(autoAnalyze);
  const screenshotRef = useRef<Screenshot | null>(null);
  const isAnalyzingRef = useRef(false);
  const lastAnalyzeTimeRef = useRef(0);

  // Minimum seconds between auto-analyses to avoid rate limits
  const AUTO_ANALYZE_COOLDOWN_MS = 15000;

  // Keep refs in sync
  autoAnalyzeRef.current = autoAnalyze;

  // Filter provider chain to only vision-capable providers
  const getVisionChain = useCallback((): LLMProvider[] => {
    const chain = getProviderChain();
    return chain.filter((p) => getProviderById(p.id)?.supportsVision);
  }, [getProviderChain]);

  // Load screens on mount
  useEffect(() => {
    listScreens().then(setScreens).catch(console.error);
  }, []);

  // Analyze screenshot via cloud LLM
  const analyzeCurrentScreenshot = useCallback(async (shot?: Screenshot, isAuto = false) => {
    // Concurrency guard — prevent overlapping API calls
    if (isAnalyzingRef.current) return;

    // Auto-analyze cooldown — don't spam the API
    if (isAuto) {
      const elapsed = Date.now() - lastAnalyzeTimeRef.current;
      if (elapsed < AUTO_ANALYZE_COOLDOWN_MS) return;
    }

    const targetShot = shot || screenshotRef.current;
    if (!targetShot || !targetShot.data) {
      setError('No screenshot to analyze');
      return;
    }

    const visionChain = getVisionChain();
    if (visionChain.length === 0) {
      const allChain = getProviderChain();
      if (allChain.length === 0) {
        setError('No LLM providers configured. Go to Settings and enable a provider.');
      } else {
        setError('No vision-capable providers configured. Enable Anthropic (Claude), OpenAI (GPT-4o), or Google (Gemini) in Settings.');
      }
      return;
    }

    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setError(null);

    try {
      const startTime = Date.now();

      const messages: Message[] = [
        {
          role: 'system',
          content: 'You are ScreenTutor, an AI that helps users learn software by looking at their screen. Briefly describe what application and view you see, and note the key UI elements visible.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What do you see on my screen?' },
            { type: 'image', data: targetShot.data },
          ],
        },
      ];

      const { result } = await callWithFallback(visionChain, messages, {
        maxTokens: 1024,
        timeoutMs: 60000,
      });

      if (result.success) {
        setLlmResponse(getResponseText(result.response));
        setLastProvider(result.providerId);
        setStats((prev) => ({
          ...prev,
          analyzeCount: prev.analyzeCount + 1,
          lastAnalyzeTime: Date.now() - startTime,
        }));
      } else {
        const rateHit = result.error.code === 'rate_limit';
        setError(
          rateHit
            ? 'Rate limit hit. Wait a minute before analyzing again, or add another vision provider as fallback.'
            : result.error.message
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      isAnalyzingRef.current = false;
      lastAnalyzeTimeRef.current = Date.now();
      setIsAnalyzing(false);
    }
  }, [getVisionChain, getProviderChain]);

  // Keep capture callback ref up to date
  onCaptureRef.current = (shot: Screenshot) => {
    setScreenshot(shot);
    screenshotRef.current = shot;
    setStats((prev) => ({
      ...prev,
      captureCount: prev.captureCount + 1,
      changeCount: shot.changed ? prev.changeCount + 1 : prev.changeCount,
    }));

    if (autoAnalyzeRef.current && shot.changed) {
      analyzeCurrentScreenshot(shot, true);
    }
  };

  // Keep error callback ref up to date
  onErrorRef.current = (err: Error) => {
    setError(err.message);
  };

  // Set up capture manager callbacks — runs once on mount, never re-runs
  useEffect(() => {
    const manager = getCaptureManager();
    manager.setOnCapture((shot) => onCaptureRef.current(shot));
    manager.setOnError((err) => onErrorRef.current(err));

    return () => {
      manager.stop();
    };
  }, []);

  // Start/stop capturing
  const toggleCapture = async () => {
    const manager = getCaptureManager();

    if (isCapturing) {
      manager.stop();
      setIsCapturing(false);
    } else {
      await setCaptureConfig({
        screen_index: selectedScreen,
        max_width: 1280,
      });

      manager.start(captureInterval);
      setIsCapturing(true);
      setError(null);
    }
  };

  // Change selected screen
  const handleScreenChange = async (index: number) => {
    setSelectedScreen(index);
    if (isCapturing) {
      await setCaptureConfig({ screen_index: index });
    }
  };

  const hasProviders = getProviderChain().length > 0;
  const hasVisionProviders = getVisionChain().length > 0;

  return (
    <div className="vision-debug-panel">
      <div className="debug-header">
        <h3>Screen Test</h3>
        <div className="status-badges">
          <span className={`badge ${hasVisionProviders ? 'success' : hasProviders ? 'warning' : 'warning'}`}>
            Vision: {hasVisionProviders ? 'Ready' : 'No Vision Providers'}
          </span>
          {lastProvider && (
            <span className="badge success">
              Last: {lastProvider}
            </span>
          )}
        </div>
      </div>

      <div className="debug-controls">
        <div className="control-row">
          <label>Screen:</label>
          <select
            value={selectedScreen}
            onChange={(e) => handleScreenChange(Number(e.target.value))}
            disabled={screens.length === 0}
          >
            {screens.map((s) => (
              <option key={s.index} value={s.index}>
                {s.name} ({s.width}x{s.height}){s.is_primary ? ' [Primary]' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="control-row">
          <label>Interval:</label>
          <select
            value={captureInterval}
            onChange={(e) => setCaptureIntervalMs(Number(e.target.value))}
            disabled={isCapturing}
          >
            <option value={500}>500ms</option>
            <option value={1000}>1s</option>
            <option value={2000}>2s</option>
            <option value={5000}>5s</option>
          </select>
        </div>

        <div className="control-row">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoAnalyze}
              onChange={(e) => setAutoAnalyze(e.target.checked)}
              disabled={!hasVisionProviders}
            />
            Auto-analyze on change
          </label>
        </div>

        <div className="control-buttons">
          <button onClick={toggleCapture} className={isCapturing ? 'active' : ''}>
            {isCapturing ? 'Stop Capture' : 'Start Capture'}
          </button>
          <button
            onClick={() => analyzeCurrentScreenshot()}
            disabled={!screenshot || isAnalyzing || !hasVisionProviders}
          >
            {isAnalyzing ? 'Analyzing...' : 'Analyze Now'}
          </button>
        </div>
      </div>

      {!hasVisionProviders && (
        <div className="setup-guide">
          <h4>Setup Required: Vision Provider</h4>
          <p>
            Screen analysis requires a provider that supports image input.
            Consumer subscriptions (Claude Max, ChatGPT Plus) don't include API access &mdash;
            you need an API key.
          </p>
          <div className="setup-option free">
            <h5>Free Option: Google AI Studio</h5>
            <ol>
              <li>Go to <strong>aistudio.google.com</strong> and sign in with Google</li>
              <li>Click "Get API key" &rarr; "Create API key"</li>
              <li>Copy the key</li>
              <li>Go to the <strong>Settings</strong> tab in this app</li>
              <li>Find "Google AI Studio" under Free Providers</li>
              <li>Paste your key and enable it</li>
            </ol>
            <p className="setup-note">Uses Gemini Flash &mdash; free, 15 requests/min, 1M tokens/day</p>
          </div>
          <div className="setup-option paid">
            <h5>Paid Options</h5>
            <p>For best quality, use your own API key with one of these:</p>
            <ul>
              <li><strong>Anthropic (Claude)</strong> &mdash; best teaching personality</li>
              <li><strong>OpenAI (GPT-4o)</strong> &mdash; strong general reasoning</li>
              <li><strong>Google (Gemini Pro)</strong> &mdash; long context, good multimodal</li>
            </ul>
          </div>
        </div>
      )}

      {error && <div className="debug-error">{error}</div>}

      <div className="debug-stats">
        <span>Captures: {stats.captureCount}</span>
        <span>Changes: {stats.changeCount}</span>
        <span>Analyses: {stats.analyzeCount}</span>
        {stats.lastAnalyzeTime > 0 && <span>Last: {stats.lastAnalyzeTime}ms</span>}
      </div>

      <div className="debug-content">
        <div className="screenshot-panel">
          <h4>
            Screenshot
            {screenshot && (
              <span className={`change-badge ${screenshot.changed ? 'changed' : 'unchanged'}`}>
                {screenshot.changed ? 'Changed' : 'No Change'}
              </span>
            )}
          </h4>
          <div className="screenshot-container">
            {screenshot?.data ? (
              <img
                src={`data:image/png;base64,${screenshot.data}`}
                alt="Screen capture"
                className="screenshot-thumbnail"
              />
            ) : (
              <div className="screenshot-placeholder">
                No screenshot yet. Click "Start Capture" to begin.
              </div>
            )}
          </div>
          {screenshot && (
            <div className="screenshot-info">
              {screenshot.width}x{screenshot.height} · {new Date(screenshot.timestamp).toLocaleTimeString()}
            </div>
          )}
        </div>

        <div className="analysis-panel">
          <h4>LLM Response</h4>
          <div className="analysis-content">
            {llmResponse ? (
              <div className="llm-response">
                <pre>{llmResponse}</pre>
              </div>
            ) : (
              <div className="analysis-placeholder">
                {isAnalyzing
                  ? 'Sending screenshot to LLM...'
                  : 'No analysis yet. Capture a screenshot and click "Analyze Now".'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
