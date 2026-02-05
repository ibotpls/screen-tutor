/**
 * Vision System Type Definitions
 *
 * Types for screen capture and change detection.
 * Screenshots are sent directly to cloud LLM providers for understanding.
 */

/**
 * Raw screenshot data from Tauri
 */
export interface Screenshot {
  /** Base64-encoded PNG image data */
  data: string;
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Timestamp when captured (Unix ms) */
  timestamp: number;
  /** Whether this screenshot differs from the previous one */
  changed: boolean;
}

/**
 * Screen/display information
 */
export interface ScreenInfo {
  index: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
}

/**
 * Capture configuration
 */
export interface CaptureConfig {
  /** Screen index to capture (0 = primary) */
  screen_index: number;
  /** Optional region to capture [x, y, width, height] */
  region: [number, number, number, number] | null;
  /** Threshold for considering pixels as different (0-255) */
  diff_threshold: number;
  /** Minimum percentage of pixels that must differ to count as "changed" */
  change_threshold_percent: number;
  /** Maximum width for the output image (for performance) */
  max_width: number | null;
}
