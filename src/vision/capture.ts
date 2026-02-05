/**
 * Screen Capture Module
 *
 * Interfaces with the Tauri backend to capture screenshots.
 * Handles capture timing, change detection, and thumbnail generation.
 */

import type { Screenshot, ScreenInfo, CaptureConfig } from './types';

const DEBUG = false;

// Dynamic import of Tauri API to avoid errors in browser-only mode
let invoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null;

async function getInvoke() {
  if (invoke) return invoke;

  try {
    const tauri = await import('@tauri-apps/api/core');
    invoke = tauri.invoke;
    if (DEBUG) console.log('[capture] Tauri API loaded');
    return invoke;
  } catch (error) {
    console.warn('[capture] Tauri API not available, running in browser mode');
    return null;
  }
}

/**
 * List available screens/displays
 */
export async function listScreens(): Promise<ScreenInfo[]> {
  const inv = await getInvoke();
  if (!inv) {
    return [
      {
        index: 0,
        name: 'Primary Screen (Mock)',
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        is_primary: true,
      },
    ];
  }

  return inv('list_screens', {}) as Promise<ScreenInfo[]>;
}

/**
 * Capture a screenshot from the configured screen
 */
export async function captureScreen(): Promise<Screenshot> {
  const inv = await getInvoke();
  if (!inv) {
    return {
      data: '',
      width: 1920,
      height: 1080,
      timestamp: Date.now(),
      changed: true,
    };
  }

  const result = await inv('capture_screen', {}) as Screenshot;
  if (DEBUG) console.log('[capture] Screenshot:', result.width, 'x', result.height);
  return result;
}

/**
 * Update capture configuration
 */
export async function setCaptureConfig(config: Partial<CaptureConfig>): Promise<void> {
  const inv = await getInvoke();
  if (!inv) return;

  const fullConfig: CaptureConfig = {
    screen_index: config.screen_index ?? 0,
    region: config.region ?? null,
    diff_threshold: config.diff_threshold ?? 30,
    change_threshold_percent: config.change_threshold_percent ?? 0.5,
    max_width: config.max_width ?? 1920,
  };

  await inv('set_capture_config', { config: fullConfig });
}

/**
 * Reset capture state (force next capture to detect change)
 */
export async function resetCapture(): Promise<void> {
  const inv = await getInvoke();
  if (!inv) return;

  await inv('reset_capture', {});
}

/**
 * Create a data URL from a screenshot for display
 */
export function createThumbnail(screenshot: Screenshot): string {
  if (!screenshot.data) return '';

  // The screenshot is already resized by the backend, just return the data URL
  return `data:image/png;base64,${screenshot.data}`;
}

/**
 * Continuous capture manager for periodic screenshots
 */
export class CaptureManager {
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private isCapturing = false;
  private isBusy = false;
  private intervalMs = 2000;
  private lastScreenshot: Screenshot | null = null;
  private onCapture: ((screenshot: Screenshot) => void) | null = null;
  private onError: ((error: Error) => void) | null = null;

  /**
   * Start continuous capture at the specified interval.
   * Uses setTimeout instead of setInterval to prevent overlap.
   */
  start(intervalMs: number = 2000): void {
    if (this.isCapturing) return;

    this.isCapturing = true;
    this.intervalMs = intervalMs;
    this.scheduleNext(0); // Capture immediately
  }

  /**
   * Stop continuous capture
   */
  stop(): void {
    this.isCapturing = false;
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  private scheduleNext(delayMs: number): void {
    if (!this.isCapturing) return;
    this.timeoutId = setTimeout(() => {
      this.capture();
    }, delayMs);
  }

  /**
   * Set the callback for when a screenshot is captured
   */
  setOnCapture(callback: (screenshot: Screenshot) => void): void {
    this.onCapture = callback;
  }

  /**
   * Set the callback for capture errors
   */
  setOnError(callback: (error: Error) => void): void {
    this.onError = callback;
  }

  /**
   * Get the last captured screenshot
   */
  getLastScreenshot(): Screenshot | null {
    return this.lastScreenshot;
  }

  /**
   * Check if capture is running
   */
  isRunning(): boolean {
    return this.isCapturing;
  }

  /**
   * Perform a single capture
   */
  private async capture(): Promise<void> {
    if (this.isBusy || !this.isCapturing) return;
    this.isBusy = true;
    try {
      const screenshot = await captureScreen();
      this.lastScreenshot = screenshot;
      if (this.onCapture) {
        this.onCapture(screenshot);
      }
    } catch (error) {
      if (DEBUG) console.error('[CaptureManager] Capture error:', error);
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error(String(error)));
      }
    } finally {
      this.isBusy = false;
      this.scheduleNext(this.intervalMs);
    }
  }
}

// Singleton instance for the capture manager
let captureManagerInstance: CaptureManager | null = null;

export function getCaptureManager(): CaptureManager {
  if (!captureManagerInstance) {
    captureManagerInstance = new CaptureManager();
  }
  return captureManagerInstance;
}
