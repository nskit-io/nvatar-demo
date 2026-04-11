# NVatar Demo — AI Avatar Chat with Voice & 3D

[한국어](README.ko.md) | [日本語](README.ja.md)

Meet your AI avatar companion in a virtual 3D room. Chat naturally, hear them speak with cloned voice, watch emotions and gestures respond in real-time.

**[Try Live Demo](https://nskit-io.github.io/nvatar-demo/)**

## Features

- **3D Virtual Room** — VRM avatars with 33 Mixamo animations (idle, walk, emotions, gestures, dance)
- **Natural Conversation** — Powered by Gemma 26B MoE with personality, memory, and emotion tracking
- **Voice Output** — ElevenLabs Voice Clone TTS (KO/JA/EN/ZH/ES/FR + 32 languages)
- **Voice Input** — Whisper STT (automatic language detection)
- **Web Search** — Real-time factual search with structured results
- **Multi-language** — Korean, Japanese, English, Chinese — UI and conversation
- **Avatar Lab** — Test VRM models with Mixamo FBX animations

## Quick Start

1. Open **[Live Demo](https://nskit-io.github.io/nvatar-demo/)**
2. Choose a **Character Model** from the grid
3. Enter a **Name** for your avatar
4. Select **Personality** and **Language**
5. Click **Create Avatar** → You're in the room!

### In the Room

| Action | How |
|--------|-----|
| **Chat** | Type in the input box and press Send (or Enter) |
| **Voice Input** | Click 🎤 to record → auto-transcribe → auto-send |
| **Move Avatar** | Double-click anywhere on the floor |
| **Change Language** | Side panel → Language selector (clears conversation) |
| **TTS On/Off** | Side panel → 🔊 TTS toggle |
| **Add Furniture** | Side panel → Desk, Shelf, Lamp, Plant |
| **Search Results** | When avatar searches, badge appears → click to view |

### Tips

- The avatar **remembers your conversations** and develops personality over time
- Ask factual questions like "What's today's exchange rate?" — the avatar will search for you
- Try switching languages mid-conversation — the avatar adapts naturally
- Voice output quality depends on your language (best for KO/JA/EN)
- Maximum **3 avatars** per user — delete old ones to create new

## Pages

| Page | Description |
|------|-------------|
| `index.html` | Lobby — Browse VRM models, create avatar (max 3), enter room |
| `room.html` | Chat room — 3D avatar, chat, TTS, STT, search results |
| `avatar-lab.html` | Avatar Lab — Load VRM, test Mixamo FBX animations |

## Architecture

```
Browser (this demo)              NVatar Server (nvatar.nskit.io)
─────────────────                ────────────────────────────────
index.html                       POST /api/v1/avatars (create)
  → Choose VRM model             GET  /api/v1/avatars (list)
  → Set personality & language   GET  /api/v1/assets (VRM/FBX list)
  → Enter room

room.html                        WebSocket /ws/chat/{id}
  → Chat via WebSocket             → Gemma 26B inference
  → TTS via /api/v1/tts            → ElevenLabs Voice Clone
  → STT via Whisper                → Whisper large-v3
  → Search results (SDK)           → CSW WebSearch
  → Language change                → POST /api/v1/avatars/{id}/language

avatar-lab.html                  GET /api/v1/assets
  → Load VRM models                → VRM/FBX file listing
  → Apply Mixamo FBX               → Static file serving
```

All AI processing happens on the server. The demo pages are pure HTML/JS — no build step, no dependencies.

## NVatar SDK

The demo includes `NVatarSDK` for search result handling:

```javascript
// Real-time callback when search results arrive
NVatarSDK.onLookupResult = (data) => {
  // data: { query, text, items: [{title, summary}] }
  console.log(data.query, data.items);
};

// Get all collected results
const results = NVatarSDK.getLookupResults();

// Unread count
const unread = NVatarSDK.getUnreadCount();

// Clear
NVatarSDK.clearLookupResults();
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| AI Model | Gemma 4 26B MoE (4-bit, MLX on Apple Silicon) |
| TTS | ElevenLabs Voice Clone (turbo v2.5) |
| STT | Whisper large-v3 (MLX) |
| 3D | Three.js + @pixiv/three-vrm + Mixamo FBX |
| Search | CSW (Claude) WebSearch hybrid |
| Backend | Python FastAPI + WebSocket |
| Hosting | GitHub Pages (demo) + NCP (server) |

## Self-Hosting

This demo connects to `nvatar.nskit.io`. To run your own NVatar server, contact us.

## License

MIT — Demo code only. VRM models have individual licenses (see model metadata). Mixamo animations are served via API (not redistributed).

## Contact

- GitHub: [@nskit-io](https://github.com/nskit-io)
- Built by [Neoulsoft](https://neoulsoft.com)
