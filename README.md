# screen-tutor

# Claude Code Project Brief: ScreenTutor — v3

## What We're Building

An AI-powered desktop screen agent that teaches users how to use Digital Audio Workstations (DAWs) by watching their screen, understanding what they're looking at, and guiding them with a customizable voice and visual overlays — without taking autonomous actions on the user's behalf.

The AI is a **guide, not a driver**. It moves a highlight/overlay to show users where things are, explains what each control does in context, speaks guidance aloud in a voice the user chooses (or their own cloned voice), and only writes to the DAW when given unambiguous input (specific notes, transcribed hums). The user always stays in control.

This is the MVP of a larger platform vision: a universal software tutor that starts with DAWs and can expand to any complex software (Blender, Unreal Engine, Photoshop, etc). The architecture must be built with this scalability in mind from day one.

---

## Core Concept

### The Problem
DAWs like Ableton Live, FL Studio, and Logic Pro have steep learning curves. Musicians know what they want to hear but get lost in the interface. Current solutions are either:
- YouTube tutorials (passive, not contextual)
- Built-in help (generic, not adaptive)
- AI tools like FL Studio's "Gopher" (text advice only, doesn't point at things or take action, locked to one DAW)

### Our Solution
A desktop agent that:
1. **Sees** the user's DAW screen in real-time via a local GUI vision model
2. **Listens** to the user via voice input (speech and humming/beatboxing)
3. **Speaks** guidance aloud in a customizable voice — pick from built-in voices or clone your own
4. **Guides** by highlighting UI elements and narrating instructions
5. **Teaches** by explaining the "why" behind every action, building real skills
6. **Transcribes** hummed melodies/beatboxed rhythms into MIDI (the one area where AI writes data)
7. **Writes specific notes** only when the user gives exact instructions ("give me a half note C in bar 5")

### Three Interaction Tiers
- **Tier 1 — Navigation & Education (AI acts freely):** Moves overlay/highlight to correct location, explains controls, navigates user through workflows
- **Tier 2 — Transcription (AI writes with permission):** Converts hummed melodies to MIDI, writes specific requested notes — always previewed before committing
- **Tier 3 — Suggestions (AI recommends, user executes):** "Your low end sounds thin — try boosting 80-100Hz on the bass, here's where the EQ is" — then navigates there, but user turns the knob

---

## Technical Architecture

### High-Level Stack (Two-Layer Vision Architecture)

```
┌─────────────────────────────────────────────────────┐
│                User Interface Layer                   │
│  Voice input · Screen overlay · Chat panel · Settings │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│              Core Agent Engine                        │
│  LLM orchestration · Memory · Pedagogy logic          │
│  (Receives STRUCTURED TEXT, not images)               │
└──────────────────────┬──────────────────────────────┘
                       │
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│ Layer 1:      │ │ Domain   │ │ Action       │
│ LOCAL GUI     │ │ Knowledge│ │ Engine       │
│ Vision Model  │ │          │ │              │
│               │ │ Skill    │ │ Cursor       │
│ UI-TARS /     │ │ graphs   │ │ highlight    │
│ ShowUI /      │ │ Software │ │ Overlay      │
│ OmniParser    │ │ maps     │ │ drawing      │
│               │ │ per app  │ │              │
│ Runs locally  │ │          │ │              │
│ Cost: $0      │ │          │ │              │
└──────────────┘ └──────────┘ └──────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Layer 2: LLM Provider (API — user's choice)   │
│                                               │
│ Receives structured text from Layer 1:        │
│ "Button 'Add Track' at [340, 220],            │
│  Slider 'Volume' at [150, 180] value=0.75..." │
│                                               │
│ Provider options (user selects in Settings):  │
│  ┌─────────────────────────────────────────┐  │
│  │ PAID TIER                               │  │
│  │  • Claude (Anthropic)                   │  │
│  │  • GPT-4o / GPT-4.1 (OpenAI)           │  │
│  │  • Gemini Pro (Google)                  │  │
│  │  • DeepSeek                             │  │
│  │  • Mistral                              │  │
│  ├─────────────────────────────────────────┤  │
│  │ FREE TIER                               │  │
│  │  • OpenRouter (30+ free models)         │  │
│  │  • Groq (Llama 3.3 70B, fast)           │  │
│  │  • Google AI Studio (Gemini free tier)  │  │
│  │  • Ollama (fully local, no internet)    │  │
│  ├─────────────────────────────────────────┤  │
│  │ AUTO-FALLBACK CHAIN                     │  │
│  │  Primary → Secondary → Free → Local     │  │
│  └─────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

### Why Two Layers?

**The critical insight from our research:** sending raw screenshots to an LLM for every interaction is slow (~3-5 seconds per call), expensive (1,000-1,500+ tokens per image), and unreliable (general LLMs struggle with precise UI element grounding). Purpose-built GUI models solve this.

**Layer 1 (Local GUI Model)** handles the expensive visual work:
- Takes screenshots, identifies every UI element (buttons, sliders, labels, etc.)
- Outputs structured text with bounding boxes and semantic descriptions
- Runs on the user's GPU — completely free, fast (1-3 seconds), no internet needed
- Only job: "What's on screen and where is everything?"

**Layer 2 (LLM API)** handles the smart teaching work:
- Receives structured text descriptions of the screen (NOT images — much cheaper)
- Applies DAW knowledge, pedagogical reasoning, personality
- Only job: "Given what's on screen, how do I teach this person?"

This separation means:
- **80-90% cost reduction** vs pure vision LLM approach
- **Faster responses** — local model runs in parallel, LLM only processes text
- **Works offline** — if using Ollama locally for both layers
- **API-agnostic** — user picks their LLM provider, we just send text

---

## Layer 1: Local GUI Vision Model (Screen Understanding)

### Recommended Models (all open source, no training needed)

#### UI-TARS (ByteDance) — Primary recommendation
- **License:** Apache 2.0 (fully open source, commercial use OK)
- **Sizes:** 2B, 7B, 72B parameters
- **What it does:** Takes a screenshot + task prompt, outputs coordinates and reasoning about UI elements
- **How it works:** Send base64-encoded screenshot via OpenAI-compatible API, model returns structured actions with x,y coordinates
- **Hardware:** 7B model at Q4 quantization fits in ~5GB VRAM (runs on RTX 3060+, or Apple Silicon with 8GB+ unified memory)
- **Speed:** ~2.5 seconds per interaction round (with quantization)
- **Desktop app:** github.com/bytedance/UI-TARS-desktop — ready-made Electron app with local/remote operators
- **Models:** huggingface.co/bytedance-research/UI-TARS-7B-DPO (and 1.5-7B for latest version)
- **Deployment:** Run via vLLM or Ollama locally, exposes OpenAI-compatible API on localhost

#### ShowUI (NUS + Microsoft) — Lightweight alternative
- **License:** Open source
- **Size:** 2B parameters only — runs on almost any hardware
- **Accuracy:** 75.1% zero-shot screenshot grounding (impressive for its size)
- **Key innovation:** UI-Guided Visual Token Selection — reduces redundant visual tokens by 33%
- **Best for:** Users with limited hardware (laptop GPUs, integrated graphics)
- **GitHub:** github.com/showlab/ShowUI

#### OmniParser (Microsoft) — Screen parser (complementary)
- **What it does:** Detects and labels all interactable UI elements in a screenshot with bounding boxes
- **Not an agent** — purely a parser. Feed its output to any LLM
- **Best for:** Converting raw screenshots into structured element lists
- **GitHub:** github.com/microsoft/OmniParser
- **License:** AGPL (icon detection model), MIT (caption model)

### How Layer 1 Actually Works in Practice

```
1. Screen change detected (pixel diff threshold)
2. Screenshot captured of DAW window
3. Screenshot → Local GUI model (UI-TARS 7B via Ollama)
4. Model outputs structured data:
   {
     "thought": "I see Ableton Live's Session View with 4 MIDI tracks",
     "elements": [
       {"type": "button", "label": "Add Track", "position": [340, 220]},
       {"type": "slider", "label": "Track 1 Volume", "position": [150, 180], "value": "0.75"},
       {"type": "dropdown", "label": "Audio Effects", "position": [400, 180]},
       {"type": "clip_slot", "label": "Clip 1-1", "position": [200, 300], "state": "empty"},
       {"type": "button", "label": "Record", "position": [50, 50], "state": "inactive"}
     ],
     "view": "session_view",
     "context": "4 MIDI tracks visible, no clips recorded yet, tempo 120 BPM"
   }
5. This structured text → Layer 2 (LLM API) for reasoning + teaching
```

### Layer 1 Deployment Options

Users choose in Settings how to run the GUI model:

| Option | Setup | Speed | Hardware Needed |
|--------|-------|-------|-----------------|
| **Ollama (recommended)** | `ollama pull ui-tars:7b-q4` | ~2-3s | 8GB+ VRAM or 16GB+ RAM |
| **vLLM** | Docker container | ~2-3s | 8GB+ VRAM (NVIDIA) |
| **HuggingFace Endpoint** | Cloud API (free tier available) | ~3-5s | None (cloud) |
| **ShowUI (lightweight)** | `ollama pull showui:2b` | ~1-2s | 4GB+ VRAM or 8GB+ RAM |
| **OmniParser only** | Local Python | <1s | CPU-only OK |

**Fallback chain for Layer 1:**
1. Try local Ollama (if installed and model pulled)
2. Try local vLLM (if running)
3. Fall back to HuggingFace Endpoint
4. Fall back to OmniParser-only mode (no reasoning, just element detection)
5. Ultimate fallback: send screenshot directly to Layer 2 LLM (expensive but works)

---

## Layer 2: LLM Provider System (Teaching Intelligence)

### Design Principle: OpenAI-Compatible API Standard

All major LLM providers now support the OpenAI chat completions format. Our app uses a single interface, and users swap providers by changing `baseURL` and `apiKey` in Settings. **Zero code changes between providers.**

```typescript
// Core interface — identical for ALL providers
interface LLMProvider {
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  tier: 'paid' | 'free' | 'local';
  maxTokens?: number;
  rateLimit?: { requestsPerMin: number; tokensPerMin: number };
}
```

### Provider Registry

#### Paid Tier (best quality, user brings own API key)

| Provider | Model | Base URL | Strengths |
|----------|-------|----------|-----------|
| **Anthropic (Claude)** | claude-sonnet-4-5 | api.anthropic.com/v1 | Best instruction following, teaching personality |
| **OpenAI** | gpt-4o, gpt-4.1 | api.openai.com/v1 | Strong general reasoning |
| **Google** | gemini-2.5-pro | generativelanguage.googleapis.com/v1beta/openai | Long context, multimodal fallback |
| **DeepSeek** | deepseek-chat | api.deepseek.com/v1 | High quality, very cheap ($0.27/M input) |
| **Mistral** | mistral-large | api.mistral.ai/v1 | Good European option, fast |

#### Free Tier (no API key needed or free sign-up, rate-limited)

| Provider | Models Available | Limits | Base URL |
|----------|-----------------|--------|----------|
| **OpenRouter** | 30+ free models (Llama 3.3, Gemma 3, Qwen, Mistral) | 50 req/day (free), 1000/day ($10 credit) | openrouter.ai/api/v1 |
| **Groq** | Llama 3.3 70B, Gemma 2 9B | 14,400 req/day, 15K tokens/min | api.groq.com/openai/v1 |
| **Google AI Studio** | Gemini Flash, Gemma 3 | Generous free quota | generativelanguage.googleapis.com/v1beta/openai |
| **Together AI** | $25 free credits on signup | Credit-based | api.together.xyz/v1 |

#### Local Tier (fully offline, no internet, no cost)

| Option | Models | Setup |
|--------|--------|-------|
| **Ollama** | Llama 3.3 8B/70B, Mistral, Qwen, DeepSeek | `ollama pull llama3.3:8b` |
| **LM Studio** | Any GGUF model | GUI app, drag-and-drop model loading |
| **LocalAI** | Full OpenAI-compatible stack | Docker container |

### Provider Fallback Chain

The app maintains an ordered chain of providers. If the primary fails (rate limit, network error, API key invalid), it automatically tries the next:

```typescript
const defaultChain: LLMProvider[] = [
  // 1. User's preferred paid provider (if configured)
  userConfiguredProvider,
  // 2. Fast free option
  { name: 'Groq', baseURL: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', tier: 'free' },
  // 3. Free with model variety
  { name: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', tier: 'free' },
  // 4. Google free tier
  { name: 'Google AI Studio', baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.0-flash', tier: 'free' },
  // 5. Local (if Ollama running)
  { name: 'Ollama', baseURL: 'http://localhost:11434/v1', model: 'llama3.3:8b', tier: 'local' },
];

async function callLLM(messages: Message[]): Promise<Response> {
  for (const provider of chain) {
    try {
      const response = await fetch(`${provider.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey || 'none'}`,
        },
        body: JSON.stringify({ model: provider.model, messages, max_tokens: 2048 }),
      });
      if (response.ok) return response;
    } catch (e) {
      console.log(`Provider ${provider.name} failed, trying next...`);
      continue;
    }
  }
  throw new Error('All LLM providers exhausted');
}
```

### Settings UI for Provider Selection

The app needs a Settings panel where users can:
1. **Select preferred provider** from a dropdown (shows all options with tier labels)
2. **Enter API key** (for paid providers)
3. **Test connection** button (sends a simple ping to verify)
4. **Configure fallback order** (drag-and-drop reorder)
5. **See status indicators** (green = connected, yellow = rate-limited, red = failed)
6. **Auto-detect Ollama** (check if localhost:11434 is responding)
7. **Quality vs Speed toggle** (routes to bigger/smaller models)

---

## Desktop App Framework

- **Tauri** (Rust-based, lightweight alternative to Electron)
- Cross-platform (Mac + Windows priority)
- Runs alongside the DAW as a companion app
- Transparent overlay window for highlighting UI elements on top of the DAW

---

## Voice Input

- **Whisper** (OpenAI's speech-to-text) or local alternative for speech recognition
- Need to distinguish between:
  - Speech commands/questions ("how do I add reverb?")
  - Humming/singing (pitched audio for melody transcription)
  - Beatboxing (percussive audio for rhythm transcription)
- Classification layer to route audio to the right handler

---

## Hum/Melody Transcription

- **Spotify's Basic Pitch** — open source, Apache 2.0, runs faster than real-time
  - GitHub: https://github.com/spotify/basic-pitch
  - Polyphonic, instrument-agnostic, pitch bend detection
- **Pitchfinder** (JS library) for real-time monophonic pitch detection
  - GitHub: https://github.com/peterkhayes/pitchfinder
- Output: MIDI data for injection into the DAW

---

## DAW Communication (for Tier 2 — writing notes/MIDI)

- **Ableton Live:** AbletonOSC (github.com/ideoforms/AbletonOSC) exposes the Live Object Model via OSC. Python wrapper: pylive
- **FL Studio:** Flapi (github.com/MaddyGuthridge/Flapi) — remote control via MIDI Controller Scripting API
- **Logic Pro:** No good external API — screen-agent-only approach (simulated keyboard shortcuts)
- **MVP: Start with Ableton Live only** (best API surface)

---

## Screen Overlay System

- Transparent always-on-top window rendered by Tauri
- Can draw: highlighted rectangles/circles, arrows, tooltip bubbles, step indicators
- Overlay coordinates derived from Layer 1's element detection output
- Must handle different screen sizes, DPI scaling, and DAW window positions

---

## Voice Output / Text-to-Speech (Customizable Tutor Voice)

The tutor speaks guidance aloud so the user can keep their eyes on the DAW. The voice is fully customizable — users pick from built-in voices or clone their own from a short audio sample.

### Design Principle: Provider-Agnostic TTS (same pattern as LLM providers)

TTS providers follow the same pluggable architecture as LLM providers. User selects their engine in Settings. Free local options always available as fallback.

```typescript
interface TTSProvider {
  name: string;
  type: 'api' | 'local';
  supportsVoiceCloning: boolean;
  voices: VoicePreset[];          // Built-in voices for this provider
  synthesize(text: string, voiceId: string): Promise<AudioBuffer>;
  cloneVoice?(sampleAudio: Blob): Promise<string>;  // Returns new voiceId
}

interface VoicePreset {
  id: string;
  name: string;                   // Display name: "Calm Mentor", "Hype Producer", etc.
  description: string;            // "Patient, warm, explains things step-by-step"
  provider: string;               // Which TTS provider owns this voice
  isCustom: boolean;              // true if user-uploaded clone
  sampleUrl?: string;             // Preview audio clip
}
```

### TTS Provider Registry

#### Paid Tier (best quality, user brings own API key)

| Provider | Voice Cloning? | Quality | Latency | Base URL |
|----------|---------------|---------|---------|----------|
| **ElevenLabs** | Yes (Instant Voice Cloning from ~30s sample) | Best-in-class, most natural | ~200ms first byte | api.elevenlabs.io/v1 |
| **OpenAI TTS** | No (fixed voices only) | Very good, 6 built-in voices | ~300ms first byte | api.openai.com/v1/audio/speech |

#### Free / Local Tier (runs on user's machine, no internet, no cost)

| Provider | Voice Cloning? | Quality | Setup |
|----------|---------------|---------|-------|
| **Piper TTS** | No (pre-trained voices, many languages) | Good, natural-sounding | Download ~50MB voice model per voice |
| **Fish Speech** | Yes (voice cloning from ~10-30s sample) | Good, improving fast | Local Python server, ~2GB VRAM |
| **Coqui TTS / XTTS** | Yes (voice cloning from ~6s sample) | Good | Local Python, ~4GB VRAM |

### Built-in Voice Library

Ship with 5-8 curated voice presets that cover different teaching vibes. These map to real voices from whatever TTS provider the user has configured:

| Voice Name | Vibe | Description |
|-----------|------|-------------|
| **The Producer** | Chill, experienced | Calm mentor energy. "Alright, see that EQ? Bump the low shelf a bit..." |
| **The Engineer** | Technical, precise | Studio engineer explaining signal flow. Detailed but clear. |
| **The Hype Coach** | Energetic, encouraging | "Yo that melody is fire! Now let me show you how to layer it..." |
| **The Professor** | Patient, thorough | Academic approach. Explains the theory behind every move. |
| **The Minimalist** | Brief, direct | Says only what's needed. No fluff. "Click there. Now drag up." |

Each preset maps to a specific voice ID on each provider. When user switches TTS provider, the same "Calm Mentor" preset maps to the closest matching voice on the new provider.

### Custom Voice Upload (Voice Cloning)

Users can make the tutor sound like anyone:

**How it works:**
1. User clicks "Add Custom Voice" in Settings
2. Records or uploads 10-60 seconds of clear speech audio
3. Audio is processed by the TTS provider's cloning API (ElevenLabs, Fish Speech, or Coqui)
4. New custom voice appears in the voice picker alongside built-in presets
5. Voice data stored locally — never sent anywhere the user didn't choose

**Provider routing for cloning:**
- If user has ElevenLabs API key → use ElevenLabs Instant Voice Cloning (best quality)
- Else if Fish Speech is installed locally → use Fish Speech local cloning (free, private)
- Else if Coqui/XTTS is installed → use XTTS local cloning (free, private)
- Else → show message: "Voice cloning requires ElevenLabs API key or a local cloning model"

**Privacy note:** When using local cloning (Fish Speech / Coqui), voice data never leaves the user's machine. When using ElevenLabs, voice data is sent to their API — the app must clearly inform the user before uploading.

### TTS Fallback Chain

Same graceful degradation as LLM providers:

```
1. User's preferred TTS provider (ElevenLabs, OpenAI TTS)
2. Local Piper TTS (if installed — no cloning, but good built-in voices)
3. OS-native TTS (macOS say / Windows SAPI — always available, worst quality)
4. Text-only mode (no audio, guidance shown as text overlay + chat)
```

### Settings UI for Voice

The Voice section of Settings lets users:
1. **Pick active voice** from dropdown (shows all built-in + custom voices with preview button)
2. **Preview voice** — plays a short sample: "Hi, I'm your tutor. Let me show you around Ableton."
3. **Select TTS provider** (ElevenLabs / OpenAI TTS / Piper / Fish Speech / OS native)
4. **Upload custom voice** — record or drag-and-drop audio file
5. **Adjust speech rate** — slider from 0.5x to 2.0x
6. **Toggle voice on/off** — some users prefer text-only
7. **Volume control** — independent from system volume

---

## Core Agent / LLM Orchestration

The teaching brain that receives structured screen data from Layer 1 and produces guidance.

System prompt encodes:
- The current screen state (structured text from Layer 1, NOT raw images)
- The current app context (which DAW, which view)
- Pedagogical principles (explain why before how, adapt to user speed)
- The software map for the current DAW
- User's skill level and learning history

Function calling / tool use for structured actions:
- `highlight_element(element_id, label)` — draw overlay on the element Layer 1 identified
- `navigate_to(concept)` — guide user to a specific part of the DAW
- `explain(topic, depth)` — provide contextual education
- `transcribe_audio(audio_data)` — convert hum to MIDI
- `write_midi(track, notes)` — inject notes into DAW via API
- `speak(text)` — narrate guidance aloud using the user's selected voice

---

## Domain Knowledge Structure

### Software Map (per app)
```json
{
  "app": "Ableton Live 12",
  "views": {
    "session": {
      "description": "Grid of clips organized by track (columns) and scene (rows)",
      "key_elements": ["clip_slots", "scene_launchers", "track_headers", "master_track"],
      "common_tasks": ["launching clips", "recording", "arranging loops"]
    },
    "arrangement": {
      "description": "Linear timeline view for arranging a full song",
      "key_elements": ["timeline", "track_lanes", "automation_lanes", "locators"],
      "common_tasks": ["arranging sections", "editing clips", "automation"]
    }
  },
  "concepts": {
    "track": { "description": "...", "types": ["audio", "midi", "return", "master"] },
    "device": { "description": "...", "types": ["instrument", "audio_effect", "midi_effect"] },
    "clip": { "description": "...", "properties": ["loop", "warp", "launch_mode"] }
  }
}
```

### Skill Graph (per app)
```json
{
  "skills": {
    "basic_navigation": {
      "description": "Moving between Session and Arrangement view",
      "prerequisites": [],
      "difficulty": "beginner",
      "estimated_time": "5min",
      "steps": ["..."]
    },
    "using_eq": {
      "description": "Using EQ Eight to shape frequency content",
      "prerequisites": ["basic_navigation", "adding_effects", "understanding_frequency"],
      "difficulty": "intermediate",
      "estimated_time": "15min",
      "steps": ["..."]
    }
  }
}
```

### Designed for Reuse
Adding support for Blender, Unreal Engine, Photoshop = new software maps and skill graphs in the same format. The agent engine consumes them identically.

---

## Project Structure

```
screentutor/
├── src-tauri/                    # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs               # App entry point
│   │   ├── screen.rs             # Screen capture logic
│   │   ├── overlay.rs            # Transparent overlay window management
│   │   ├── audio.rs              # Microphone input handling
│   │   └── daw/
│   │       ├── mod.rs            # DAW communication trait (app-agnostic)
│   │       └── ableton.rs        # Ableton-specific OSC implementation
│   └── Cargo.toml
├── src/                          # Frontend (React + TypeScript)
│   ├── App.tsx
│   ├── components/
│   │   ├── Overlay.tsx           # Visual overlay renderer
│   │   ├── ChatPanel.tsx         # Text chat interface
│   │   ├── VoiceInput.tsx        # Voice recording UI
│   │   ├── MidiPreview.tsx       # Preview transcribed MIDI
│   │   ├── SkillTracker.tsx      # User's learning progress
│   │   └── Settings.tsx          # Provider selection, API keys, voice, preferences
│   ├── providers/                # LLM Provider System
│   │   ├── types.ts              # LLMProvider interface, Message types
│   │   ├── registry.ts           # All known providers with configs
│   │   ├── client.ts             # OpenAI-compatible API client
│   │   ├── fallback.ts           # Fallback chain logic
│   │   └── health.ts             # Provider health checking / auto-detection
│   ├── vision/                   # Layer 1: Local GUI Vision
│   │   ├── types.ts              # ScreenState, UIElement types
│   │   ├── capture.ts            # Screenshot capture + diff detection
│   │   ├── model-client.ts       # Client for local GUI model (Ollama/vLLM)
│   │   ├── parser.ts             # Parse model output into structured ScreenState
│   │   └── config.ts             # Vision model selection + hardware detection
│   ├── voice/                    # Voice Output / TTS System (NEW)
│   │   ├── types.ts              # TTSProvider, VoicePreset interfaces
│   │   ├── engine.ts             # TTS orchestration + fallback chain
│   │   ├── voices.ts             # Built-in voice preset registry
│   │   ├── custom-voice.ts       # Voice cloning from uploaded audio samples
│   │   └── providers/
│   │       ├── elevenlabs.ts     # ElevenLabs API (best quality, paid, cloning)
│   │       ├── openai-tts.ts     # OpenAI TTS (good quality, paid, no cloning)
│   │       ├── piper.ts          # Piper TTS (open source, local, free, no cloning)
│   │       ├── fish-speech.ts    # Fish Speech (open source, local, free, cloning)
│   │       └── os-native.ts      # macOS say / Windows SAPI (always available)
│   ├── agent/
│   │   ├── engine.ts             # Core agent orchestration
│   │   ├── screen-reader.ts      # Now uses Layer 1 output (structured text, NOT raw images)
│   │   ├── pedagogy.ts           # Teaching strategy logic
│   │   └── tools.ts              # Tool definitions for LLM function calling
│   ├── knowledge/
│   │   ├── types.ts              # TypeScript types for skill graphs and software maps
│   │   ├── ableton/
│   │   │   ├── software-map.json
│   │   │   └── skill-graph.json
│   │   └── loader.ts
│   └── audio/
│       ├── speech.ts             # Speech-to-text
│       ├── classifier.ts         # Speech vs hum vs beatbox classification
│       └── transcriber.ts        # Hum-to-MIDI via Basic Pitch
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## MVP Scope (v0.1)

### Must Have
- [ ] Tauri desktop app that runs alongside Ableton Live
- [ ] Screen capture of the Ableton window at regular intervals
- [ ] **Layer 1 integration** — local GUI model (UI-TARS 7B via Ollama) for screen understanding
- [ ] **Layer 2 provider system** — settings UI where user picks their LLM provider
- [ ] **Fallback chain** — graceful degradation through paid → free → local providers
- [ ] Provider health checking and auto-detection (is Ollama running? is API key valid?)
- [ ] Voice input (speech-to-text via Whisper API or local Whisper)
- [ ] **Voice output / TTS** — agent speaks guidance aloud via pluggable TTS providers
- [ ] **Built-in voice library** — 5-8 voice presets with different teaching vibes
- [ ] **TTS provider selection** — settings UI to pick TTS engine (ElevenLabs / OpenAI / Piper / OS native)
- [ ] **TTS fallback chain** — graceful degradation: paid API → local Piper → OS native → text-only
- [ ] Text chat panel as alternative to voice
- [ ] Screen overlay system that can highlight rectangular regions on top of the DAW
- [ ] Agent can answer questions about what's on screen ("what does this knob do?")
- [ ] Agent can guide user to specific locations ("show me where to add an effect")
- [ ] Basic Ableton software map with core concepts
- [ ] 10-20 starter skills in the skill graph

### Nice to Have (v0.2)
- [ ] **Custom voice cloning** — upload audio sample, tutor speaks in that voice (via ElevenLabs API or local Fish Speech / Coqui)
- [ ] **Voice preview** — play sample of each voice before selecting
- [ ] **Speech rate control** — adjustable 0.5x to 2.0x speed
- [ ] Hum-to-MIDI transcription via Basic Pitch
- [ ] MIDI injection into Ableton via AbletonOSC
- [ ] User skill tracking / learning progress persistence
- [ ] Speech vs hum classification
- [ ] ShowUI 2B as lightweight Layer 1 alternative
- [ ] OmniParser as CPU-only Layer 1 fallback

### Future (v0.3+)
- [ ] FL Studio support (new knowledge, same engine)
- [ ] Logic Pro support (screen-only, no DAW API)
- [ ] Blender / Unreal Engine / Photoshop knowledge packs
- [ ] Fine-tuned Layer 1 model on DAW-specific screenshots
- [ ] Marketplace for community-created skill graphs
- [ ] Enterprise/B2B licensing

---

## Getting Started

### Prerequisites
- Node.js 18+
- Rust (latest stable) + Tauri CLI
- Ollama installed (for Layer 1 local GUI model) — ollama.com/download
- An LLM provider API key OR Ollama with a text model (for Layer 2)
- Ableton Live installed (for testing)

### Step 1: Scaffold the Tauri + React project
```bash
npm create tauri-app@latest screentutor -- --template react-ts
cd screentutor
```

### Step 2: Set up Layer 1 (Local GUI Model)
```bash
# Install Ollama from ollama.com/download, then:
ollama pull ui-tars:7b-q4          # Primary GUI model (~5GB download)
# OR for lower-end hardware:
ollama pull showui:2b               # Lightweight alternative (~1.5GB)
```

### Step 3: Set up core dependencies
```bash
# Frontend
npm install zustand                  # State management
npm install framer-motion            # Overlay animations

# No LLM SDK needed — we use raw fetch with OpenAI-compatible format
# This keeps us provider-agnostic
```

### Step 4: Implement in this order
1. **Provider system** — Build the LLM provider interface, registry, and fallback chain first (enables everything else)
2. **Screen capture** — Get Tauri to capture the active window or a screen region
3. **Layer 1 integration** — Send screenshots to local GUI model, parse structured output
4. **Overlay window** — Transparent always-on-top window that draws highlights using Layer 1 coordinates
5. **Layer 2 integration** — Send structured screen state to LLM provider, get teaching guidance
6. **Chat interface** — Basic text input/output with the agent
7. **Voice input** — Add microphone capture and speech-to-text
8. **Voice output / TTS** — Integrate TTS provider system, built-in voice library, voice selection UI
9. **Knowledge base** — Load Ableton software map and skill graph
10. **Agent loop** — Tie it all together: user asks → Layer 1 sees screen → Layer 2 reasons → agent responds with guidance + overlay + voice

---

## Key Design Decisions

1. **Two-layer vision architecture**: Layer 1 (local, free, fast) handles visual understanding. Layer 2 (API, user's choice) handles teaching intelligence. Never send raw screenshots to the LLM API unless all local options fail.

2. **API-agnostic LLM provider**: Use OpenAI-compatible format everywhere. User picks their provider. We never hard-code to one vendor.

3. **Fallback chain**: Graceful degradation from paid → free → local. The app should ALWAYS work, even with no internet and no API key (using Ollama for both layers).

4. **App-agnostic core**: The agent engine, vision system, and overlay system must never contain DAW-specific logic. All app-specific knowledge lives in the knowledge/ directory.

5. **The agent teaches, it doesn't do**: The default behavior is always to guide and explain. Writing MIDI or changing DAW state requires explicit user confirmation.

6. **Screenshot diffing**: Capture frequently but only run Layer 1 analysis when significant visual changes are detected. This saves GPU cycles and battery.

7. **Structured tool use**: The LLM should use function calling to trigger overlay highlights, navigation guidance, and explanations.

8. **Pedagogical state tracking**: Remember what the user has learned to avoid re-explaining concepts and progressively reduce hand-holding.

9. **Provider-agnostic TTS**: Voice output follows the same pluggable provider pattern as LLM and vision. User picks their TTS engine. Free local options (Piper, OS native) always available. Voice cloning only requires one of the supported cloning providers.

10. **Voice cloning privacy**: When using local TTS cloning (Fish Speech / Coqui), voice data never leaves the machine. When using cloud cloning (ElevenLabs), the app must clearly inform the user before uploading audio.

---

## Platform Scalability Notes

- **Knowledge as data, not code**: Adding a new app = new JSON files, not new agent logic
- **Generic vision layer**: Layer 1 works on ANY desktop app screenshot — no retraining needed
- **Pluggable action engine**: Overlay and input simulation are OS-level, not app-level
- **Skill graph standard**: Clear schema that works for any domain
- **Future marketplace**: Skill graph format clean enough for domain experts to author

---

## References & Resources

### Open Source Projects — Vision / Screen Understanding
- UI-TARS: https://github.com/bytedance/UI-TARS (Apache 2.0)
- UI-TARS Desktop: https://github.com/bytedance/UI-TARS-desktop
- ShowUI: https://github.com/showlab/ShowUI
- OmniParser: https://github.com/microsoft/OmniParser
- Ollama: https://ollama.com (for running local models)

### Open Source Projects — DAW / Audio
- AbletonOSC: https://github.com/ideoforms/AbletonOSC
- pylive: https://github.com/ideoforms/pylive
- Flapi (FL Studio): https://github.com/MaddyGuthridge/Flapi
- Basic Pitch (Spotify): https://github.com/spotify/basic-pitch
- Pitchfinder: https://github.com/peterkhayes/pitchfinder

### App Framework
- Tauri: https://tauri.app
- Whisper: https://github.com/openai/whisper

### Open Source Projects — TTS / Voice
- Piper TTS: https://github.com/rhasspy/piper (fast local TTS, many voices/languages)
- Fish Speech: https://github.com/fishaudio/fish-speech (local voice cloning, Apache 2.0)
- Coqui TTS / XTTS: https://github.com/coqui-ai/TTS (local voice cloning from ~6s sample)
- OpenVoice: https://github.com/myshell-ai/OpenVoice (instant voice cloning, MIT license)

### TTS API Providers
- ElevenLabs: https://elevenlabs.io (best quality, voice cloning from 30s sample)
- OpenAI TTS: https://platform.openai.com/docs/guides/text-to-speech (6 built-in voices)

### Free LLM API Providers
- OpenRouter: https://openrouter.ai (30+ free models)
- Groq: https://console.groq.com (fast inference, generous free tier)
- Google AI Studio: https://aistudio.google.com (Gemini free tier)
- Together AI: https://www.together.ai ($25 free credit)

### Competitive Landscape
- FL Studio Gopher: Text advice only, doesn't point at things, locked to FL Studio
- Google Gemini DAW watcher: Watches DAW, gives feedback, doesn't take action
- LUNA AI: Voice control + smart detection, locked to one DAW
- RipX DAW: AI stem separation + note editing, IS a DAW not a tutor
- Simular.ai: General desktop agent, not music-specific
- Generic computer use agents (Claude Computer Use, OpenAI Operator): General purpose, not for teaching

### None of these competitors combine: universal DAW support + teaching/education focus + customizable voice (with cloning) + hum transcription + visual guidance overlays + local-first architecture + API-agnostic provider system. That's our gap.
