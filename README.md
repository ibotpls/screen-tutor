# Screen Tutor

An AI-powered desktop screen agent that teaches users how to use complex software — starting with DAWs — by watching their screen, understanding what they're looking at, and guiding them with voice, visual overlays, and contextual explanations. The AI is a **guide, not a driver**: it highlights, explains, and teaches. The user stays in control.

**All vision runs locally. No screenshots sent to the cloud. $0 per interaction.**

## The problem

DAWs like Cakewalk, Ableton Live, and FL Studio have steep learning curves. Musicians know what they want to hear but get lost in the interface. Current solutions are either:
- YouTube tutorials (passive, not contextual)
- Built-in help (generic, not adaptive)
- AI tools like FL Studio's "Gopher" (text advice only, doesn't point at things, locked to one DAW)

Screen Tutor sits on top of the actual software and teaches in-context — highlighting elements, explaining what they do, speaking guidance aloud in a customizable voice, and adapting to what the user is currently looking at.

## Core concept

### Three interaction tiers

- **Tier 1 — Navigation & Education (AI acts freely):** Moves overlay/highlight to correct location, explains controls, navigates user through workflows
- **Tier 2 — Transcription (AI writes with permission):** Converts hummed melodies to MIDI, writes specific requested notes — always previewed before committing
- **Tier 3 — Suggestions (AI recommends, user executes):** "Your low end sounds thin — try boosting 80-100Hz on the bass, here's where the EQ is" — then navigates there, but user turns the knob

### Task decomposition

The product needs four distinct capabilities, each requiring a different kind of tool:

1. **See** — look at a screenshot and identify what UI elements exist, where they are, and what state they're in
2. **Know** — have domain knowledge about what each element does in this specific software
3. **Teach** — explain things clearly, adapt to the user's level, remember what they've learned
4. **Locate** — given a concept ("the reverb send"), find where it is on the current screen

LLMs are good at #3 (teaching/language) but overkill for #1 (vision/detection) and don't inherently have #2 (domain knowledge). The architecture uses the right tool for each job.

---

## Technical architecture

### Vision pipeline (all local, all free)

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: UI DETECTION (YOLOv8, runs locally)               │
│                                                             │
│  Input: Screenshot (pixels)                                 │
│  Output: Bounding boxes + coarse element classes             │
│  Speed: <100ms on CPU. Cost: $0.                            │
│                                                             │
│  Trained model provided by the DAW UI Labeler project.      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 2: ELEMENT IDENTIFICATION (context + embeddings)     │
│                                                             │
│  Input: Detected element + spatial context                  │
│  Output: Specific element ID from knowledge base            │
│                                                             │
│  Context-based lookup: a "knob" inside "ProChannel EQ"      │
│  panel → "prochannel_eq_freq_knob". Falls back to CLIP      │
│  embedding similarity for ambiguous cases.                  │
│  Speed: ~20ms. Cost: $0.                                    │
│                                                             │
│  May collapse into Layer 1 if YOLO classification proves    │
│  granular enough — TBD after initial training.              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 3: KNOWLEDGE GRAPH (structured data, no model)       │
│                                                             │
│  Input: Element IDs on screen                               │
│  Output: What they do, how they relate, what to teach       │
│                                                             │
│  Structured JSON/database. Instant lookup. Cost: $0.        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  LAYER 4: TEACHING ENGINE (small LLM or templates)          │
│                                                             │
│  Input: Structured context from layers 1–3 + user query     │
│  Output: Natural language explanation + highlight coords    │
│                                                             │
│  Small local LLM (7B via Ollama) or template system.        │
│  No vision needed — all understanding done upstream.        │
│  Speed: ~200–400ms. Cost: $0.                               │
└─────────────────────────────────────────────────────────────┘
```

**Total per interaction: <500ms latency, $0 cost, fully offline capable.**

---

## Desktop app framework

- **Tauri** (Rust-based, lightweight alternative to Electron)
- Windows 11 primary, macOS planned
- Runs alongside the DAW as a companion app
- Transparent overlay window for highlighting UI elements on top of the DAW

---

## LLM provider system (teaching engine only)

The LLM is only used for natural language generation in the teaching layer. It never sees screenshots — it receives structured context (detected elements, knowledge graph data, user query) and generates explanations. Even a 7B local model works well since no vision is needed.

### Provider tiers

**Paid (user brings own API key):** Claude, GPT-4o/4.1, Gemini Pro, DeepSeek, Mistral

**Free (rate-limited):** OpenRouter, Groq, Google AI Studio, Together AI

**Local (fully offline):** Ollama, LM Studio, LocalAI

**No-LLM fallback:** Template system fills structured templates from the knowledge graph. App works with no LLM at all.

All providers use the OpenAI-compatible chat completions format. User swaps providers in Settings.

### Fallback chain

```
User's preferred provider → Groq → OpenRouter → Google AI Studio → Ollama → Templates
```

The app always works — even fully offline with no LLM installed.

---

## Voice input

- **Whisper** (OpenAI's speech-to-text) or local alternative
- Classification layer distinguishes between:
  - Speech commands/questions ("how do I add reverb?")
  - Humming/singing (pitched audio → melody transcription)
  - Beatboxing (percussive audio → rhythm transcription)

---

## Voice output / TTS

The tutor speaks guidance aloud so the user can keep their eyes on the DAW.

### TTS provider tiers

**Paid:** ElevenLabs (best quality, voice cloning), OpenAI TTS

**Free / Local:** Piper TTS, Fish Speech (local voice cloning), Coqui TTS / XTTS

**Always available:** OS-native TTS (Windows SAPI), text-only fallback

### Built-in voice library

| Voice | Vibe |
|-------|------|
| **The Producer** | Chill, experienced mentor |
| **The Engineer** | Technical, precise, detailed |
| **The Hype Coach** | Energetic, encouraging |
| **The Professor** | Patient, thorough, theory-focused |
| **The Minimalist** | Brief, direct, no fluff |

### Custom voice cloning

Upload 10–60 seconds of audio. Routes to ElevenLabs (cloud) or Fish Speech / Coqui (local, private — voice data never leaves the machine).

---

## Hum / melody transcription

- **Spotify's Basic Pitch** — open source, polyphonic, faster than real-time
- **Pitchfinder** (JS) for real-time monophonic pitch detection
- Output: MIDI data, always previewed before committing

---

## DAW communication (Tier 2)

- **Cakewalk:** Keyboard shortcut simulation + potential COM automation
- **Ableton Live:** AbletonOSC
- **FL Studio:** Flapi
- **Logic Pro:** Simulated keyboard shortcuts (Mac only)

---

## Screen overlay system

- Transparent always-on-top window rendered by Tauri
- Draws: highlighted rectangles/circles, arrows, tooltip bubbles, step indicators
- Coordinates driven by YOLO detection output
- Handles different screen sizes, DPI scaling, DAW window positions

---

## Domain knowledge

### Software map (per app)

```json
{
  "app": "Cakewalk by BandLab",
  "views": {
    "track_view": {
      "description": "Main workspace — timeline with tracks, clips, and bus panes",
      "key_elements": ["track_pane", "clips_pane", "bus_pane", "timeline_ruler", "transport"],
      "common_tasks": ["recording", "editing clips", "arranging", "automation"]
    },
    "console_view": {
      "description": "Mixer — channel strips with faders, inserts, sends",
      "key_elements": ["channel_strips", "master_bus", "insert_slots", "send_knobs", "meters"],
      "common_tasks": ["mixing levels", "adding effects", "routing", "panning"]
    }
  }
}
```

### Skill graph (per app)

```json
{
  "skills": {
    "basic_navigation": {
      "prerequisites": [],
      "difficulty": "beginner",
      "estimated_time": "5min"
    },
    "using_eq": {
      "prerequisites": ["basic_navigation", "adding_effects", "understanding_frequency"],
      "difficulty": "intermediate",
      "estimated_time": "15min"
    }
  }
}
```

Adding a new app = new software map + skill graph in the same JSON format. The agent engine consumes them identically.

### Knowledge sources

- **Tutorial video extraction:** Frame-by-frame UI detection + cursor tracking + Whisper transcription → aligned action→explanation pairs feeding the knowledge graph
- **Documentation extraction:** Software manuals parsed into structured element→description mappings
- **Manual curation:** Expert-written explanations for key concepts and workflows

---

## Agent orchestration

System prompt receives: detected elements on screen (from vision pipeline), which DAW and view, pedagogical principles, software map data, user's skill level and learning history. **Structured text only — no screenshots, no vision tokens.**

Function calling:
- `highlight_element(element_id, label)` — draw overlay on element
- `navigate_to(concept)` — guide user to a specific UI area
- `explain(topic, depth)` — contextual education
- `transcribe_audio(audio_data)` — convert hum to MIDI
- `write_midi(track, notes)` — inject notes into DAW
- `speak(text)` — narrate guidance in the user's selected voice

---

## Supported software

**Phase 1 — Free DAWs:**
- [ ] Cakewalk by BandLab (primary)
- [ ] Reaper

**Phase 2 — Paid DAWs:**
- [ ] FL Studio, Ableton Live, Studio One, Cubase, Bitwig

**Phase 3 — Beyond DAWs:**
- [ ] Pro Tools, Reason
- [ ] Blender, Unreal Engine, Photoshop, etc.

---

## Dependencies

- **[DAW UI Labeler](link-to-labeler-repo)** — separate project that generates the training data and trained YOLO models that power this app's vision pipeline. Must be built first. See that repo for details on the labeling pipeline, active learning loop, and software update handling.

---

## Project structure

```
screentutor/
├── src-tauri/                        # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs                   # App entry point
│   │   ├── screen.rs                 # Screen capture + change detection
│   │   ├── overlay.rs                # Transparent overlay window
│   │   ├── audio.rs                  # Microphone input handling
│   │   └── daw/
│   │       ├── mod.rs                # DAW communication trait
│   │       └── cakewalk.rs           # Cakewalk-specific implementation
│   └── Cargo.toml
├── src/                              # Frontend (React + TypeScript)
│   ├── App.tsx
│   ├── components/
│   │   ├── Overlay.tsx
│   │   ├── ChatPanel.tsx
│   │   ├── VoiceInput.tsx
│   │   ├── MidiPreview.tsx
│   │   ├── SkillTracker.tsx
│   │   └── Settings.tsx
│   ├── providers/                    # LLM provider system
│   │   ├── types.ts
│   │   ├── registry.ts
│   │   ├── client.ts
│   │   ├── fallback.ts
│   │   └── health.ts
│   ├── vision/                       # Local vision pipeline
│   │   ├── capture.ts               # Screenshot capture + change detection
│   │   ├── detector.ts              # YOLOv8 inference (ONNX runtime)
│   │   ├── identifier.ts            # Element ID resolution
│   │   └── models/                  # Trained model files (.onnx)
│   ├── voice/
│   │   ├── engine.ts
│   │   ├── voices.ts
│   │   ├── custom-voice.ts
│   │   └── providers/
│   ├── agent/
│   │   ├── engine.ts
│   │   ├── pedagogy.ts
│   │   └── tools.ts
│   ├── knowledge/
│   │   ├── types.ts
│   │   ├── cakewalk/
│   │   │   ├── software-map.json
│   │   │   └── skill-graph.json
│   │   └── loader.ts
│   └── audio/
│       ├── speech.ts
│       ├── classifier.ts
│       └── transcriber.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## MVP scope (v0.1)

### Must have
- [ ] Tauri desktop app running alongside Cakewalk
- [ ] Screen capture with change detection
- [ ] Local vision pipeline (YOLOv8 → element ID → knowledge lookup)
- [ ] Screen overlay highlighting detected elements
- [ ] Teaching engine (local LLM or templates, structured text input only)
- [ ] LLM provider system with fallback chain
- [ ] Voice input (Whisper)
- [ ] Voice output (TTS with built-in voice library)
- [ ] Text chat panel
- [ ] Basic Cakewalk software map + 10–20 starter skills

### Nice to have (v0.2)
- [ ] Custom voice cloning
- [ ] Hum-to-MIDI via Basic Pitch
- [ ] MIDI preview and injection into Cakewalk
- [ ] Skill tracking / learning progress
- [ ] Speech vs hum classification
- [ ] Tutorial video extraction pipeline

### Future (v0.3+)
- [ ] Reaper, FL Studio, Ableton support
- [ ] Non-DAW software
- [ ] Community skill graph marketplace

---

## Key design decisions

1. **All-local vision.** No screenshots sent to the cloud. $0 per interaction, <500ms, fully offline.
2. **LLM for teaching only.** Receives structured text, never screenshots. Works with 7B local models. Template fallback means no LLM required.
3. **Guide, not driver.** Teaches and explains. Writing to the DAW requires explicit user confirmation.
4. **App-agnostic core.** All DAW-specific knowledge lives in JSON files. Adding a new app = new data, not new code.
5. **Fallback chains everywhere.** LLM and TTS both degrade gracefully. App always works.
6. **Vision model is an external dependency.** Trained by the DAW UI Labeler project, consumed here as an ONNX file.

---

## Competitive landscape

| Product | Limitation |
|---------|-----------|
| FL Studio Gopher | Text only, no visual guidance, locked to FL Studio |
| Google Gemini DAW watcher | Feedback only, no overlay, no teaching |
| LUNA AI | Locked to one DAW |
| Simular.ai | General desktop agent, not for teaching |
| Claude Computer Use / OpenAI Operator | General purpose, not education-focused |

**Our gap:** Universal DAW support + teaching focus + customizable voice + hum transcription + visual overlays + all-local vision + API-agnostic.

---

## Platform

- **Windows 11** (primary)
- macOS planned

---

## References

### Core
- Tauri: https://tauri.app
- YOLOv8: https://github.com/ultralytics/ultralytics
- ONNX Runtime: https://onnxruntime.ai
- Whisper: https://github.com/openai/whisper

### Audio / DAW
- Basic Pitch: https://github.com/spotify/basic-pitch
- AbletonOSC: https://github.com/ideoforms/AbletonOSC
- Flapi: https://github.com/MaddyGuthridge/Flapi

### TTS
- Piper TTS: https://github.com/rhasspy/piper
- Fish Speech: https://github.com/fishaudio/fish-speech
- Coqui TTS: https://github.com/coqui-ai/TTS
- ElevenLabs: https://elevenlabs.io

### LLM providers
- Ollama: https://ollama.com
- OpenRouter: https://openrouter.ai
- Groq: https://console.groq.com
- Google AI Studio: https://aistudio.google.com

## License

[TBD]