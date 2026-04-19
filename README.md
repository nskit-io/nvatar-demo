# NVatar — Your AI Avatar Friend That Remembers, Feels, and Speaks

[한국어](README.ko.md) | [日本語](README.ja.md) | [中文](README.zh.md)

> A living AI companion in a 3D virtual room — with voice cloning, emotion tracking, personality evolution, and multilingual conversation.

**[Try Live Demo](https://nskit-io.github.io/nvatar-demo/)**

### Screenshots

| Lobby | Room |
|-------|------|
| <img src="screenshots/demo_lobby.png" width="400"> | <img src="screenshots/demo_room_welcome.png" width="400"> |

| Search Results | Chat Demo |
|----------------|-----------|
| <img src="screenshots/demo_room_search_result.png" width="400"> | <img src="screenshots/demo_room_hello.gif" width="400"> |

---

## What Makes NVatar Different?

Most AI chatbots are stateless text generators. NVatar is an **AI companion that lives in a 3D room** — it remembers your conversations, develops its personality over time, tracks emotions across 9 dimensions, and speaks with a cloned human voice in 32+ languages.

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

### 9-Dimensional Emotion Tracking
Every message updates the avatar's emotional state across 9 dimensions:
`joy · sadness · anger · anxiety · affection · excitement · boredom · trust · curiosity`

Emotions naturally decay over time (sadness fades, excitement calms down), and high emotions trigger visible expressions and gestures on the 3D avatar.

### Personality Evolution
Your avatar starts with a base personality (Friendly, Calm, Tsundere, etc.) + random MBTI. Over time, conversations shape 8 personality traits through a `pending_delta → decay → commit` cycle. The avatar literally grows with you.

### Identity Preservation
When your avatar works as a code assistant or language tutor, it gains domain knowledge without changing its core personality. This is achieved through a **3-track memory architecture** — core memories (personality), user profile (behavioral patterns), and franchise memories (domain-specific) are kept strictly separate. A tutor session makes your avatar smarter about the subject, not a different person.

### Voice Cloning TTS
Not a generic robot voice — a **cloned human voice** that speaks 32+ languages with natural intonation:
- Language-aware speed (KO: 0.85x, JA: 0.65x)
- Text preprocessing (emoji removal, pronunciation guide stripping)
- Queue-based playback with interrupt-on-input

### BehaviorPattern Registry
NVatar's capabilities are extensible through a **pluggable behavior system**. Each behavior — Normal Chat, Code Assist, Language Tutor, or your own custom pattern — registers as a self-contained plugin with its own prompt style, tool access, and memory track. A **God Mode** meta-layer analyzes incoming messages and routes them to the right pattern without character bias, so the avatar seamlessly switches between casual conversation and specialized tasks.

### Autonomous Agency (Avatar OS)
Your avatar is not a state machine — it has an **agency layer** that decides for itself.
- **Distributed judgment**: A separate `nvatar-judge` service handles classification; the heavy 26B core model only runs for actual conversation.
- **Activity Density (T1~T4)**: The more you talk to your avatar, the more alive it is. When you stop visiting, it gradually hibernates — T4 accrues one logic-based memory per day with **zero LLM cost**. Return anytime and it wakes up instantly.
- **Rest = memory consolidation**: When an avatar rests (you permit it or it gets quiet), it compacts its own memory. A state field is an actual behavior trigger, not just a label.
- **Source-agnostic state**: Whether a state change comes from your command, the avatar's own decision, or a UI event — one code path, three origins tracked separately.
- **Trace observability**: Every decision is logged. "Why didn't Vivi respond to me?" has a queryable answer.

Phase 1 shipped **2026-04-20** with 12-hour stress test: 655 iterations, zero errors, 100% step-1 judgment success.

### Social Ecosystem: Avatars That Know Each Other
Most AI companions are 1:1 — you talk, it responds, end of story. NVatar goes further: **invite your other avatars into the room and they start forming relationships with each other**.

**Core principle: *One personality, many relationships.***

- Each avatar has a **singular personality** shaped only by conversations with you (the user).
- Avatar↔avatar dialogues build **relationship intimacy** (`nv_avatar_relationships` table) without polluting personality.
- When two avatars chat, their memory context is scoped to that specific pair — they recall how many times they've talked, the last topic, the intimacy level.
- A **Room Manager** orchestrates the scene: periodic dialogue triggers, sticky targets, multi-name parsing ("A야, B야, 안녕" → sequential speech queue), auto-cascade (up to 2 turns) when one avatar addresses another.
- **Contextual speech levels** — the same avatar speaks to you with your configured politeness (존댓말/반말/하대), but switches to casual peer tone with other avatars. Natural social dynamics.
- **AFK-safe** — tab-hidden pauses the scheduler; hourly cap prevents runaway dialogue accumulation when you leave the room open (including for future screensaver-style use).

Invite a friend from the **👥 친구** panel, watch them walk in, and the two avatars greet each other within seconds. Address either by name ("루빈아, 비비는 어떤 친구야?") and a chained conversation unfolds — with each participant remembering their side of the story.

### Structured Search SDK
When you ask factual questions, the avatar searches the web and delivers results through `NVatarSDK`:
```javascript
NVatarSDK.onLookupResult = (data) => {
  // { query, items: [{title, summary}], ts, read }
};
```
Results are collected passively — the SDK is designed for integration into any frontend.

For building custom integrations, see [NVatar SDK](https://github.com/nskit-io/nvatar-sdk).

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
| **Behavior Patterns** | Pluggable registry — Normal Chat, Code Assist, custom patterns via SDK |
| **Franchise Memory** | Domain-specific memory track that preserves avatar identity across tasks |
| **Social Ecosystem** | Invite other avatars — they form relationships with each other (intimacy-tracked, personality-isolated) |
| **Room Manager** | Central orchestrator for multi-avatar conversations: dialogue queue, sticky target, auto-cascade |
| **Room Authoring** | Edit mode: multi-select meshes in the scene → group/name them → save as room config to DB |
| **Avatar OS** | Autonomous agency layer: distributed judgment (judge + core), source-agnostic state, Activity Density 4-tier, rest-triggered compaction, trace observability |

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
| **Invite Friends** | Top bar → 👥 친구 → pick another of your avatars to enter the room |
| **Address Specific Friend** | Type "루빈아, 안녕" — name prefix routes the message to that friend |
| **Edit Mode** | Top bar → ✏️ Edit → gizmo-based furniture moving + ✍ Authoring side panel |
| **Move Panel** | Drag the panel header; double-click to fold |
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
  → Choose VRM + personality       → Avatar CRUD (+ vrm_uid, voice_id)
  → Enter room                     → Language change

room.html                        WebSocket + AI Pipeline
  → Room Manager                    → God Mode (message analysis & routing)
     · Central scheduler             → BehaviorPattern Registry
     · Speech queue (serial)           → NormalChat / CodeAssist / custom
     · Sticky target                 → Gemma 26B (local)
     · Auto-cascade                  → ElevenLabs TTS (cloud)
  → Friend Panel                    → CSW WebSearch (cloud)
     · Invite your avatars          → Emotion Engine (9-dim)
  → Chat / TTS / STT                → Relationship-scoped Memory
  → Room Authoring                    · user track (personality)
  → Search SDK                        · avatar:X track (per-pair intimacy)
                                     → Persona Evolution (user track only)

avatar-lab.html                  Static Assets + DB
  → VRM models                    → 35 VRM models (uid-resolved)
  → Mixamo FBX                    → Mixamo FBX animations
                                  → nv_rooms / nv_objects (room registry)
                                  → nv_avatar_relationships (intimacy)
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
| **[NVatar SDK](https://github.com/nskit-io/nvatar-sdk)** | Build custom behavior patterns and integrations |
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
- **Investment & Sponsorship** — nskit@nskit.io
- **Investment inquiries** — We're open to partnerships and investment discussions

For business inquiries, investment opportunities, or self-hosting licenses:

📧 **nskit@nskit.io**

## Contact

- GitHub: [@nskit-io](https://github.com/nskit-io)
- Built by [Neoulsoft](https://neoulsoft.com)
