# NVatar Demo — AI Avatar Chat with Voice & 3D

Meet your AI avatar companion in a virtual 3D room. Chat naturally, hear them speak with cloned voice, watch emotions and gestures respond in real-time.

## Features

- **3D Virtual Room** — VRM avatars with 33 Mixamo animations (idle, walk, emotions, gestures, dance)
- **Natural Conversation** — Powered by Gemma 26B MoE with personality, memory, and emotion tracking
- **Voice Output** — ElevenLabs Voice Clone TTS (KO/JA/EN/ZH/ES/FR + 32 languages)
- **Voice Input** — Whisper STT (automatic language detection)
- **Web Search** — CSW hybrid lookup for factual answers
- **Avatar Lab** — Test VRM models with Mixamo FBX animations

## Try It

**[Live Demo](https://nskit-io.github.io/nvatar-demo/)** — Create an avatar and start chatting.

## Pages

| Page | Description |
|------|-------------|
| `index.html` | Lobby — Create avatar (max 3), select and enter room |
| `room.html` | Chat room — 3D avatar, chat, TTS, search results |
| `avatar-lab.html` | Avatar Lab — Load VRM, test Mixamo animations |

## How It Works

```
Browser (this demo)          NVatar Server (nvatar.nskit.io)
─────────────────            ────────────────────────────────
index.html                   POST /api/v1/avatars (create)
  → Create avatar            GET /api/v1/avatars (list)
  → Enter room

room.html                    WebSocket /ws/chat/{id}
  → Chat via WebSocket         → Gemma 26B inference
  → TTS via /api/v1/tts        → ElevenLabs Voice Clone
  → Search results (SDK)       → CSW WebSearch

avatar-lab.html              GET /api/v1/assets
  → Load VRM models            → VRM/FBX file listing
  → Apply Mixamo FBX           → Static file serving
```

All AI processing happens on the server. The demo pages are pure HTML/JS — no build step, no dependencies.

## NVatar SDK

The demo includes `NVatarSDK` for search result handling:

```javascript
// Real-time callback when search results arrive
NVatarSDK.onLookupResult = (data) => {
  console.log(data.query, data.items);
};

// Get all collected results
const results = NVatarSDK.getLookupResults();

// Unread count
const unread = NVatarSDK.getUnreadCount();
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

## Self-Hosting

This demo connects to `nvatar.nskit.io`. To run your own NVatar server, contact us.

## License

MIT — Demo code only. VRM models have individual licenses (see model metadata). Mixamo animations are served via API (not redistributed).

## Contact

- GitHub: [@nskit-io](https://github.com/nskit-io)
- Built by [Neoulsoft](https://neoulsoft.com)
