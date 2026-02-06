# Screen Tutor

An AI-powered desktop screen agent that teaches users how to use complex software by watching their screen, understanding what they're looking at, and guiding them with voice, visual overlays, and contextual explanations. Also detects errors, reads dialog messages, and helps debug problems.

The AI is a **guide, not a driver**: it highlights, explains, and teaches. The user stays in control.

**All vision runs locally. No screenshots sent to the cloud. $0 per interaction.**

## Status

**Phase: Design complete, blocked on detection model.** The [Software UI Labeler](link-to-labeler-repo) project must produce a working YOLO model for Cakewalk before this project's vision pipeline can function. OCR-only mode could work sooner but the core value proposition requires element detection.

---

## What this does

Screen Tutor sits on top of the target software as a companion app. It:

1. **Sees** the UI — YOLO detects elements (knobs, buttons, faders, panels, dialogs)
2. **Reads** text — OCR reads button labels, error messages, menu items, dialog content
3. **Knows** what elements do — structured knowledge graph per software
4. **Teaches** — LLM generates explanations adapted to user skill level
5. **Highlights** — transparent overlay draws attention to specific elements
6. **Converses** — chat panel supports both screen-aware questions and open-ended learning

---

## Core concept

### Three interaction tiers

- **Tier 1 — Navigation, Education & Debugging (AI acts freely):** Highlights elements, explains controls, reads errors, diagnoses problems, guides workflows
- **Tier 2 — Transcription (AI writes with permission):** Hum-to-MIDI, writes notes — always previewed (DAW-specific, future)
- **Tier 3 — Suggestions (AI recommends, user executes):** "Try boosting 80-100Hz, here's the EQ" — navigates there, user turns the knob

### Two modes of interaction

**Screen-aware:** User clicks on or points at a UI element. Vision pipeline identifies it, teaching engine explains it.

**Open conversation:** User asks anything — "what is a frequency?", "how do I get started?", "why is there no sound?" LLM uses general knowledge + whatever screen context is available.

Both modes coexist in the same chat panel.

---

## Technical architecture

```
                        Screenshot (pixels)
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
┌──────────────────────────┐ ┌──────────────────────────┐
│  YOLO: UI DETECTION      │ │  OCR: TEXT READING        │
│                          │ │                          │
│  Bounding boxes +        │ │  Reads all text:         │
│  element classes         │ │  button labels, errors,  │
│  (knob, button, fader,   │ │  menus, dialog content,  │
│  error_dialog, panel...) │ │  status bar, tooltips.   │
│                          │ │                          │
│  Trained per-software.   │ │  Works on ANY software.  │
│  <100ms. $0.             │ │  No training. <50ms. $0. │
└────────────┬─────────────┘ └────────────┬─────────────┘
             │                            │
             └──────────┬─────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  ELEMENT IDENTIFICATION                                     │
│                                                             │
│  Merges YOLO + OCR. A "button" with text "Solo" inside      │
│  a "track_header" → element_id: "track_solo_button".        │
│  An "error_dialog" with text "Audio device not found"       │
│  → error with full message for LLM to diagnose.             │
│  ~20ms. $0.                                                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  KNOWLEDGE GRAPH (per-software, structured JSON)            │
│                                                             │
│  Element descriptions, workflows, troubleshooting trees,    │
│  concept definitions, skill prerequisites.                  │
│  Instant lookup. $0.                                        │
│                                                             │
│  Optional: OCR + LLM work without it (just less precise).   │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  TEACHING ENGINE (LLM)                                      │
│                                                             │
│  Receives STRUCTURED TEXT: detected elements, OCR text,     │
│  knowledge graph data, conversation history, user query.    │
│  Never receives screenshots.                                │
│                                                             │
│  Reasons about state, diagnoses errors, adapts to skill     │
│  level, answers open-ended questions, walks through         │
│  multi-step workflows. Asks user to reveal hidden state     │
│  (guide-then-rescan).                                       │
│                                                             │
│  7B local model via Ollama or cloud LLM. ~200-400ms. $0.    │
└─────────────────────────────────────────────────────────────┘
```

### Why OCR is critical

YOLO needs to be **trained per-software**. OCR works on **any software immediately**. This creates a graceful degradation path:

| Available | Capability |
|---|---|
| **YOLO + OCR + knowledge graph + LLM** | Full tutoring: precise element detection, deep explanations, guided workflows |
| **YOLO + OCR + LLM** (no knowledge graph) | Good: element detection + text reading, LLM explains from general knowledge |
| **OCR + LLM** (no YOLO model) | Basic: reads all text, error debugging, dialog walkthroughs, general Q&A |
| **LLM only** (no vision) | Open conversation only: conceptual questions, general workflows |

OCR is also what makes error detection work cross-software — YOLO spots the dialog, OCR reads the error message, LLM explains it.

### Why the LLM is essential (not optional)

The knowledge graph stores facts about individual elements. But real users ask questions that require reasoning:

| Question type | Example | Needs LLM? |
|---|---|---|
| "What does this knob do?" | Element lookup | Knowledge graph sufficient, LLM adapts to skill level |
| "What is a frequency?" | General concept | **Yes** — open-ended, no screen context needed |
| "How do I get started?" | Learning path | **Yes** — generates path from skill graph + general knowledge |
| "Why is there no sound?" | Diagnosis | **Yes** — reasons through causes, checks visible state |
| "What does this error mean?" | Error debugging | **Yes** — OCR reads error, LLM explains |
| "How do I make this less muddy?" | Creative/subjective | **Yes** — combines screen state + audio knowledge |
| "Why is my recording out of sync?" | Hidden state | **Yes** — guide-then-rescan pattern |

The knowledge graph provides accuracy for known elements. The LLM provides breadth, reasoning, adaptation, and open-ended conversation.

### Guide-then-rescan

When the answer depends on state behind a closed dialog:

```
User: "Why is my recording out of sync?"

LLM (seeing current screen): "That's usually a latency issue. 
Can you open Edit → Preferences → Audio?"

[User opens dialog]
[Vision re-scans — OCR reads all settings values]

LLM (seeing new screen): "Your buffer size is 2048 samples — 
that's adding ~46ms of latency. Try 256."
[Highlights buffer size dropdown]
```

---

## Domain knowledge

### Software map (per app)

```json
{
  "app": "Cakewalk by BandLab",
  "views": {
    "track_view": {
      "description": "Main workspace — timeline with tracks, clips, and bus panes",
      "key_elements": ["track_pane", "clips_pane", "transport"],
      "common_tasks": ["recording", "editing", "arranging"]
    },
    "console_view": {
      "description": "Mixer — channel strips with faders, inserts, sends",
      "key_elements": ["channel_strips", "master_bus", "insert_slots"],
      "common_tasks": ["mixing", "effects", "routing"]
    }
  }
}
```

### Skill graph

```json
{
  "basic_navigation": { "prerequisites": [], "difficulty": "beginner" },
  "using_eq": { "prerequisites": ["basic_navigation", "adding_effects"], "difficulty": "intermediate" }
}
```

### Troubleshooting trees

```json
{
  "workflow": "troubleshoot_no_sound",
  "steps": [
    { "check": "Is any track soloed?", "visible_indicator": "solo_button_active", "if_yes": "Unsolo it.", "if_no": "next" },
    { "check": "Is the track muted?", "visible_indicator": "mute_button_active", "if_yes": "Unmute it.", "if_no": "next" },
    { "check": "Audio device configured?", "visible_indicator": null, "action": "Open Edit → Preferences → Audio." }
  ]
}
```

### Concept definitions

```json
{
  "frequency": {
    "definition": "How many times a sound wave vibrates per second, measured in Hertz (Hz).",
    "analogies": ["Like pitch on a piano — left is low, right is high"],
    "related": ["equalization", "spectrum", "pitch"]
  }
}
```

Start with ~20 elements for MVP. Expand based on actual user questions, not pre-emptive completeness.

---

## LLM provider system

The LLM receives structured text only. No screenshots. Small local models work.

**Paid (user brings API key):** Claude, GPT-4o/4.1, Gemini Pro, DeepSeek, Mistral

**Free:** OpenRouter, Groq, Google AI Studio, Together AI

**Local:** Ollama (Llama 3.3 8B/70B, Mistral, Qwen), LM Studio

All use OpenAI-compatible chat completions format.

**Fallback chain:** User's preferred → Groq → OpenRouter → Google AI Studio → Ollama

---

## Agent orchestration

The LLM prompt always includes:
- Current screen state (YOLO detections + OCR text)
- Relevant knowledge graph entries (if available)
- User skill level and learning history
- Conversation history
- Relevant workflow/troubleshooting trees

Function calling:
- `highlight_element(element_id, label)` — overlay on element
- `highlight_sequence(steps[])` — multi-step guided highlights
- `highlight_text(text_match, label)` — highlight OCR-found text region
- `navigate_to(concept)` — guide to a UI area
- `request_navigation(menu_path)` — ask user to open a dialog for rescan
- `explain(topic, depth)` — contextual education
- `speak(text)` — narrate (when voice is implemented)

---

## Supported software

### Phase 1 — DAWs (validating the pipeline)
- [ ] Cakewalk by BandLab (primary — free, Windows)
- [ ] Reaper (free trial, cross-platform)

### Phase 2 — Other complex software
- [ ] Blender, GIMP, DaVinci Resolve, Unity, Unreal Engine, VS Code

### Phase 3 — General purpose
- [ ] Any software via OCR + LLM (no YOLO model needed, basic support)

---

## Platform

**Windows 11 for MVP.** The architecture supports cross-platform (Tauri, ONNX, per-OS OCR/capture), but testing three platforms before having a working product is a trap.

When cross-platform is added:

| Component | Windows | macOS | Linux |
|---|---|---|---|
| Tauri app | Native | Native | Native |
| Screen capture | Win32 API | CGWindowList | X11/Wayland |
| OCR | Windows.Media.Ocr | Vision framework | Tesseract/PaddleOCR |
| YOLO inference | ONNX Runtime | ONNX Runtime | ONNX Runtime |
| Overlay | Win32 layered window | NSWindow | X11 composite |
| LLM (local) | Ollama | Ollama | Ollama |
| TTS | Windows SAPI | macOS say | espeak/Piper |

---

## Project structure

```
screentutor/
├── src-tauri/                        # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs                   # Entry point
│   │   ├── screen.rs                 # Screen capture + change detection
│   │   ├── overlay.rs                # Transparent overlay window
│   │   ├── ocr.rs                    # Windows.Media.Ocr integration
│   │   └── daw/                      # DAW communication (future)
│   │       ├── mod.rs
│   │       └── cakewalk.rs
│   └── Cargo.toml
├── src/                              # Frontend (React + TypeScript)
│   ├── App.tsx
│   ├── components/
│   │   ├── Overlay.tsx               # Visual overlay renderer
│   │   ├── ChatPanel.tsx             # Conversational interface
│   │   ├── SkillTracker.tsx          # Learning progress (future)
│   │   └── Settings.tsx              # Provider selection, preferences
│   ├── providers/                    # LLM provider system
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── client.ts
│   │   ├── fallback.ts
│   │   └── health.ts
│   ├── vision/                       # Local vision pipeline
│   │   ├── capture.ts               # Screenshot capture + change detection
│   │   ├── detector.ts              # YOLOv8 inference (ONNX Runtime)
│   │   ├── ocr.ts                   # OCR interface (calls Rust backend)
│   │   ├── identifier.ts            # Merges YOLO + OCR → element IDs
│   │   └── models/                  # Trained .onnx model files
│   ├── agent/
│   │   ├── engine.ts                # Core agent orchestration
│   │   ├── prompt-builder.ts        # Assembles LLM prompt from all layers
│   │   ├── pedagogy.ts              # Skill level adaptation
│   │   ├── conversation.ts          # Conversation history management
│   │   └── tools.ts                 # Function calling definitions
│   └── knowledge/
│       ├── types.ts
│       ├── cakewalk/
│       │   ├── software-map.json
│       │   ├── skill-graph.json
│       │   ├── workflows.json
│       │   └── concepts.json
│       └── loader.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Milestones

### M0 — Overlay proof of concept (while labeler M0 runs in parallel)

**Goal: Validate that a Tauri app can draw overlays on top of Cakewalk.**

- [ ] Bare-bones Tauri app
- [ ] Capture the Cakewalk window
- [ ] Draw a colored rectangle at hardcoded coordinates on top of Cakewalk
- [ ] Verify: clicking through overlay reaches the DAW, DPI scaling works, fullscreen/maximized works

**If the overlay is janky:** rethink interaction model (side panel, picture-in-picture).

### M1 — Detection + overlay (depends on labeler M1)

**Goal: See YOLO detections drawn on real Cakewalk UI.**

- [ ] Load ONNX model from labeler
- [ ] Screen capture → YOLO inference → draw bounding boxes on overlay
- [ ] OCR integration (Windows.Media.Ocr) — read all text on screen
- [ ] Merge YOLO + OCR results
- [ ] Click on an element → show its class + OCR text in a panel

**This is the first "wow" moment** — the app visibly understands what's on screen.

### M2 — First useful product

**Goal: Something you could show to a real user.**

- [ ] LLM integration (Ollama local or cloud provider)
- [ ] Chat panel: type a question, get an answer with screen context
- [ ] Click an element → LLM explains it using knowledge graph + OCR text
- [ ] Basic Cakewalk knowledge: software map, ~20 element descriptions, 5 workflows
- [ ] Error detection: OCR reads error dialog → LLM explains
- [ ] Guide-then-rescan for one troubleshooting tree ("no sound")
- [ ] LLM provider settings UI

### M3 — Voice + polish

- [ ] Voice input (Whisper speech-to-text)
- [ ] Voice output (TTS — start with OS-native, add Piper/ElevenLabs later)
- [ ] Built-in voice presets
- [ ] Skill tracking / learning history
- [ ] Multi-step sequenced highlights

### Future

- [ ] Custom voice cloning
- [ ] Hum-to-MIDI (Spotify Basic Pitch)
- [ ] MIDI injection into DAWs
- [ ] Reaper, FL Studio, Ableton support
- [ ] Non-DAW software (Blender, Photoshop, etc.)
- [ ] macOS and Linux support
- [ ] Community knowledge graph marketplace

---

## Dependencies

- **[Software UI Labeler](link-to-labeler-repo)** — produces the YOLO models. Must complete its M1 before this project's M1 can start. Not needed for overlay proof-of-concept (M0) or OCR-only mode.

---

## Key design decisions

1. **YOLO + OCR in parallel.** YOLO detects visual elements. OCR reads text. Together: complete screen understanding. OCR alone gives basic support on untrained software.
2. **LLM receives structured text, never screenshots.** YOLO detections + OCR text + knowledge graph → LLM reasons from text. A 7B local model works. No vision tokens.
3. **Guide-then-rescan.** For hidden state, ask the user to open a dialog, re-analyze. Human tutors do this too.
4. **Knowledge graph + LLM complement each other.** Knowledge graph: accuracy for known elements. LLM: breadth, reasoning, adaptation, open-ended conversation.
5. **Windows first.** Cross-platform architecture, single-platform testing until validated.
6. **Text + highlights before voice.** Validate the core teaching value before investing in TTS infrastructure.
7. **App-agnostic core.** All software-specific knowledge in JSON files. New app = new data, not new code.
8. **Start with 20 elements, not 200.** Expand knowledge graph based on actual user questions.

---

## Competitive landscape

| Product | Limitation |
|---------|-----------|
| FL Studio Gopher | Text only, no visual guidance, locked to FL Studio |
| Google Gemini DAW watcher | Feedback only, no overlay, no teaching |
| LUNA AI | Locked to one DAW |
| Simular.ai | General desktop agent, not for teaching |
| Claude Computer Use / OpenAI Operator | General purpose, not education-focused |

**Our gap:** Software-agnostic + teaching focus + error debugging + visual overlays + all-local vision + conversational (not just element lookup).

---

## Voice (M3+)

Deferred to M3. Text + highlights deliver the core value. Voice adds convenience.

**When implemented:**
- Input: Whisper speech-to-text (+ hum/beatbox classification for DAW mode)
- Output: Pluggable TTS — OS native → Piper (free local) → ElevenLabs/OpenAI (paid cloud)
- Built-in voice presets: The Producer, The Engineer, The Hype Coach, The Professor, The Minimalist
- Custom voice cloning: local (Fish Speech/Coqui) or cloud (ElevenLabs)

---

## DAW communication (future, Tier 2)

- Cakewalk: keyboard shortcuts + COM automation
- Ableton: AbletonOSC
- FL Studio: Flapi
- Logic Pro: keyboard shortcuts (macOS)

---

## References

### Core
- Tauri: https://tauri.app
- YOLOv8: https://github.com/ultralytics/ultralytics
- ONNX Runtime: https://onnxruntime.ai
- Tesseract OCR: https://github.com/tesseract-ocr/tesseract
- PaddleOCR: https://github.com/PaddlePaddle/PaddleOCR

### LLM
- Ollama: https://ollama.com
- OpenRouter: https://openrouter.ai
- Groq: https://console.groq.com

### TTS (M3+)
- Piper TTS: https://github.com/rhasspy/piper
- Fish Speech: https://github.com/fishaudio/fish-speech
- ElevenLabs: https://elevenlabs.io

### Audio / DAW (future)
- Basic Pitch: https://github.com/spotify/basic-pitch
- AbletonOSC: https://github.com/ideoforms/AbletonOSC
- Flapi: https://github.com/MaddyGuthridge/Flapi

## License

[TBD]