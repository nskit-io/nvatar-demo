# NVatar — Your AI Avatar Friend That Remembers, Feels, and Speaks

[한국어](README.ko.md) | [日本語](README.ja.md)

> A living AI companion in a 3D virtual room — with voice cloning, emotion tracking, personality evolution, and multilingual conversation.

**[Try Live Demo](https://nskit-io.github.io/nvatar-demo/)**

---

## What Makes NVatar Different?

Most AI chatbots are stateless text generators. NVatar is an **AI companion that lives in a 3D room** — it remembers your conversations, develops its personality over time, tracks emotions across 8 dimensions, and speaks with a cloned human voice in 32+ languages.

### Hybrid AI Architecture
NVatar combines the best of **local** and **cloud** AI:
- **Local LLM** (Gemma 26B MoE on Apple Silicon) — Personality, conversation, emotion. Fast, private, always available.
- **Cloud Search** (Claude WebSearch) — Factual answers, real-time data. Only when needed, with user consent.

This hybrid approach means your avatar can chat naturally about feelings (local) AND tell you today's exchange rate (cloud) — without sending your personal conversations to external servers.

### 3-Layer Memory System
Your avatar doesn't just respond — it **remembers**:
- **L1 (Raw)** — Full conversation history
- **L2 (Summary)** — Key moments compressed into summaries with relevance scoring
- **L3 (Keywords)** — Long-term personality keywords that persist forever

When conversations exceed 100 messages, L1 automatically compacts into L2/L3 — like how humans remember the gist, not every word.

### 8-Dimensional Emotion Tracking
Every message updates the avatar's emotional state across 8 axes:
`joy · sadness · anger · anxiety · affection · excitement · boredom · trust`

Emotions naturally decay over time (sadness fades, excitement calms down), and high emotions trigger visible expressions and gestures on the 3D avatar.

### Personality Evolution
Your avatar starts with a base personality (Friendly, Calm, Tsundere, etc.) + random MBTI. Over time, conversations shape 8 personality traits through a `pending_delta → decay → commit` cycle. The avatar literally grows with you.

### Voice Cloning TTS
Not a generic robot voice — a **cloned human voice** that speaks 32+ languages with natural intonation:
- Language-aware speed (KO: 0.85x, JA: 0.65x)
- Text preprocessing (emoji removal, pronunciation guide stripping)
- Queue-based playback with interrupt-on-input

### Structured Search SDK
When you ask factual questions, the avatar searches the web and delivers results through `NVatarSDK`:
```javascript
NVatarSDK.onLookupResult = (data) => {
  // { query, items: [{title, summary}], ts, read }
};
```
Results are collected passively — the SDK is designed for integration into any frontend.

---

## Features

| Feature | Description |
|---------|-------------|
| **3D Virtual Room** | VRM avatars + 33 Mixamo animations (idle, walk, emotions, gestures, dance) |
| **Natural Conversation** | Gemma 26B MoE with personality, memory, and emotion |
| **Voice Output** | ElevenLabs Voice Clone TTS — 32+ languages |
| **Voice Input** | Whisper STT — automatic language detection |
| **Web Search** | Real-time factual search with structured results |
| **Multi-language** | KO, JA, EN, ZH — UI and conversation |
| **Avatar Lab** | Test VRM models with Mixamo FBX animations |
| **Anti-Repeat** | Tracks already-discussed topics to keep conversations moving forward |

---

## Quick Start

1. Open **[Live Demo](https://nskit-io.github.io/nvatar-demo/)**
2. Choose a **Character Model** from the VRM grid
3. Enter a **Name** for your avatar
4. Select **Personality** and **Language**
5. Click **Create Avatar** → You're in the room!

### In the Room

| Action | How |
|--------|-----|
| **Chat** | Type and press Send (or Enter) |
| **Voice Input** | 🎤 → Record → Auto-transcribe → Auto-send |
| **Move Avatar** | Double-click on the floor |
| **Change Language** | Side panel → Language selector (clears conversation) |
| **TTS On/Off** | Side panel → 🔊 toggle |
| **Furniture** | Side panel → Desk, Shelf, Lamp, Plant |
| **Search Results** | Badge appears when found → click to read |

### Tips

- The avatar **remembers everything** and develops personality over time
- Ask factual questions ("What's the exchange rate?") — it will search for you
- Switch languages mid-conversation — the avatar adapts naturally
- Maximum **3 avatars** per user — delete old ones to create new

---

## Architecture

```
Browser (this demo)              NVatar Server
─────────────────                ────────────────────────
index.html                       REST API
  → Choose VRM + personality       → Avatar CRUD
  → Enter room                     → Language change

room.html                        WebSocket + AI Pipeline
  → Chat                            → Context Router (10 types)
  → TTS                             → Gemma 26B (local)
  → STT                             → ElevenLabs TTS (cloud)
  → Search SDK                      → CSW WebSearch (cloud)
                                     → Emotion Engine (8-dim)
                                     → Memory System (L1→L2→L3)
                                     → Persona Evolution

avatar-lab.html                  Static Assets
  → VRM models                    → 30 VRM models
  → Mixamo FBX                    → 33 FBX animations
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **AI Model** | Gemma 4 26B MoE (4-bit quantized, MLX on Apple Silicon) |
| **TTS** | ElevenLabs Voice Clone (turbo v2.5, 0.85x speed) |
| **STT** | Whisper large-v3 (MLX, ~500ms latency) |
| **3D** | Three.js 0.160 + @pixiv/three-vrm 3.3.3 + Mixamo FBX |
| **Search** | CSW — Claude WebSearch hybrid (Sonnet) |
| **Backend** | Python FastAPI + WebSocket + uvicorn |
| **Database** | MySQL (NCP Managed DB) |
| **Hosting** | GitHub Pages (demo) + NCP Cloud (server) |

---

## NSKit Ecosystem

NVatar is part of the **NSKit** framework — an AI-native development platform.

| Project | Description |
|---------|-------------|
| **NVatar** | AI Avatar Chat (this project) |
| **NSKit Whisper** | Local STT/TTS API server on Apple Silicon |
| **CSW** | Claude Subscription Worker — AI processing pipeline |
| **NSKit Frontend** | Self-contained UI framework (jQuery-based, AI-optimized) |

---

## Self-Hosting

This demo connects to our hosted server. To run your own NVatar instance, [contact us](https://github.com/nskit-io).

## License

MIT — Demo client code. VRM models have individual licenses. Mixamo animations served via API.

## Support & Investment

NVatar is an independent R&D project. If you find it valuable:

- **Star this repo** — It helps others discover NVatar
- **Sponsor** — [GitHub Sponsors](https://github.com/sponsors/nskit-io) (coming soon)
- **Investment inquiries** — We're open to partnerships and investment discussions

For business inquiries, investment opportunities, or self-hosting licenses:

📧 **nskit@nskit.io**

## Contact

- GitHub: [@nskit-io](https://github.com/nskit-io)
- Built by [Neoulsoft](https://neoulsoft.com)
