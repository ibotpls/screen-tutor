//! Screen Capture Module
//!
//! Handles capturing screenshots of specific windows or screen regions.
//! Includes pixel diffing to detect when the screen has actually changed.

use base64::{engine::general_purpose::STANDARD, Engine};
use image::{DynamicImage, GenericImageView, ImageFormat, Rgba};
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::io::Cursor;

/// Represents a captured screenshot with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Screenshot {
    /// Base64-encoded PNG image data
    pub data: String,
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
    /// Timestamp when captured (Unix ms)
    pub timestamp: u64,
    /// Whether this screenshot differs from the previous one
    pub changed: bool,
}

/// Configuration for screen capture
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CaptureConfig {
    /// Screen index to capture (0 = primary)
    pub screen_index: usize,
    /// Optional region to capture (x, y, width, height)
    pub region: Option<(i32, i32, u32, u32)>,
    /// Threshold for considering pixels as different (0-255)
    pub diff_threshold: u8,
    /// Minimum percentage of pixels that must differ to count as "changed"
    pub change_threshold_percent: f32,
    /// Maximum width for the output image (for performance)
    pub max_width: Option<u32>,
}

impl Default for CaptureConfig {
    fn default() -> Self {
        Self {
            screen_index: 0,
            region: None,
            diff_threshold: 30,
            change_threshold_percent: 0.5,
            max_width: Some(1920),
        }
    }
}

/// Screen capture state manager
pub struct ScreenCapture {
    config: CaptureConfig,
    last_image: Option<DynamicImage>,
}

impl ScreenCapture {
    pub fn new(config: CaptureConfig) -> Self {
        Self {
            config,
            last_image: None,
        }
    }

    /// Get list of available screens
    pub fn list_screens() -> Result<Vec<ScreenInfo>, String> {
        let screens = Screen::all().map_err(|e| format!("Failed to get screens: {}", e))?;

        Ok(screens
            .iter()
            .enumerate()
            .map(|(i, s)| ScreenInfo {
                index: i,
                name: format!("Screen {}", i),
                x: s.display_info.x,
                y: s.display_info.y,
                width: s.display_info.width,
                height: s.display_info.height,
                is_primary: s.display_info.is_primary,
            })
            .collect())
    }

    /// Capture a screenshot
    pub fn capture(&mut self) -> Result<Screenshot, String> {
        log::debug!("[capture] Starting capture...");
        let screens = Screen::all().map_err(|e| {
            log::error!("[capture] Failed to get screens: {}", e);
            format!("Failed to get screens: {}", e)
        })?;
        log::debug!("[capture] Found {} screens", screens.len());

        let screen = screens
            .get(self.config.screen_index)
            .ok_or_else(|| {
                log::error!("[capture] Screen index {} not found", self.config.screen_index);
                format!("Screen index {} not found", self.config.screen_index)
            })?;

        // Capture the screen or region
        log::debug!("[capture] Capturing screen {}...", self.config.screen_index);
        let image = if let Some((x, y, w, h)) = self.config.region {
            screen
                .capture_area(x, y, w, h)
                .map_err(|e| {
                    log::error!("[capture] Failed to capture region: {}", e);
                    format!("Failed to capture region: {}", e)
                })?
        } else {
            screen
                .capture()
                .map_err(|e| {
                    log::error!("[capture] Failed to capture screen: {}", e);
                    format!("Failed to capture screen: {}", e)
                })?
        };
        log::debug!("[capture] Captured image: {}x{}", image.width(), image.height());

        // Convert to DynamicImage
        let mut img = DynamicImage::ImageRgba8(image);

        // Resize if needed for performance
        if let Some(max_width) = self.config.max_width {
            if img.width() > max_width {
                let ratio = max_width as f32 / img.width() as f32;
                let new_height = (img.height() as f32 * ratio) as u32;
                img = img.resize(max_width, new_height, image::imageops::FilterType::Triangle);
            }
        }

        // Check if image changed from last capture
        let changed = self.has_changed(&img);

        // Update last image
        self.last_image = Some(img.clone());

        // Encode to base64 PNG
        let mut buffer = Cursor::new(Vec::new());
        img.write_to(&mut buffer, ImageFormat::Png)
            .map_err(|e| {
                log::error!("[capture] Failed to encode image: {}", e);
                format!("Failed to encode image: {}", e)
            })?;

        let raw_data = buffer.into_inner();
        log::debug!("[capture] PNG: {} bytes, base64: {} chars", raw_data.len(), raw_data.len() * 4 / 3);
        let data = STANDARD.encode(raw_data);

        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        Ok(Screenshot {
            data,
            width: img.width(),
            height: img.height(),
            timestamp,
            changed,
        })
    }

    /// Check if the current image differs from the last one
    fn has_changed(&self, current: &DynamicImage) -> bool {
        let Some(last) = &self.last_image else {
            return true; // First capture always counts as changed
        };

        // If dimensions differ, it changed
        if last.width() != current.width() || last.height() != current.height() {
            return true;
        }

        let total_pixels = (current.width() * current.height()) as f32;
        let mut different_pixels = 0u32;

        // Sample pixels for performance (check every 4th pixel)
        for y in (0..current.height()).step_by(2) {
            for x in (0..current.width()).step_by(2) {
                let last_pixel = last.get_pixel(x, y);
                let current_pixel = current.get_pixel(x, y);

                if self.pixels_differ(&last_pixel, &current_pixel) {
                    different_pixels += 4; // Count as 4 since we're sampling
                }
            }
        }

        let diff_percent = (different_pixels as f32 / total_pixels) * 100.0;
        diff_percent >= self.config.change_threshold_percent
    }

    /// Check if two pixels are different beyond the threshold
    fn pixels_differ(&self, a: &Rgba<u8>, b: &Rgba<u8>) -> bool {
        let threshold = self.config.diff_threshold as i16;

        (a[0] as i16 - b[0] as i16).abs() > threshold
            || (a[1] as i16 - b[1] as i16).abs() > threshold
            || (a[2] as i16 - b[2] as i16).abs() > threshold
    }

    /// Update the capture configuration
    pub fn set_config(&mut self, config: CaptureConfig) {
        self.config = config;
        self.last_image = None; // Reset diff state
    }

    /// Clear the last image (force next capture to be "changed")
    pub fn reset(&mut self) {
        self.last_image = None;
    }
}

/// Information about a screen/display
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenInfo {
    pub index: usize,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub is_primary: bool,
}

// Tauri commands
use std::sync::Mutex;
use tauri::State;

pub struct ScreenCaptureState(pub Mutex<ScreenCapture>);

/// List available screens
#[tauri::command]
pub fn list_screens() -> Result<Vec<ScreenInfo>, String> {
    ScreenCapture::list_screens()
}

/// Capture a screenshot
#[tauri::command]
pub fn capture_screen(state: State<ScreenCaptureState>) -> Result<Screenshot, String> {
    let mut capture = state.0.lock().map_err(|e| {
        log::error!("[capture_screen] Lock error: {}", e);
        format!("Lock error: {}", e)
    })?;
    match capture.capture() {
        Ok(screenshot) => {
            log::debug!("[capture_screen] {}x{}, {} chars", screenshot.width, screenshot.height, screenshot.data.len());
            Ok(screenshot)
        }
        Err(e) => {
            log::error!("[capture_screen] Capture failed: {}", e);
            Err(e)
        }
    }
}

/// Update capture configuration
#[tauri::command]
pub fn set_capture_config(state: State<ScreenCaptureState>, config: CaptureConfig) -> Result<(), String> {
    let mut capture = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    capture.set_config(config);
    Ok(())
}

/// Reset capture state (force next capture to detect change)
#[tauri::command]
pub fn reset_capture(state: State<ScreenCaptureState>) -> Result<(), String> {
    let mut capture = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    capture.reset();
    Ok(())
}
