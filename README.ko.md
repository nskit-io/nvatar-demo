# NVatar 데모 — AI 아바타 음성 채팅 + 3D 가상 룸

[English](README.md) | [日本語](README.ja.md)

3D 가상 룸에서 AI 아바타 친구를 만나보세요. 자연스러운 대화, 음성 클로닝 TTS, 실시간 감정 표현과 제스처를 경험할 수 있습니다.

**[라이브 데모 체험하기](https://nskit-io.github.io/nvatar-demo/)**

## 주요 기능

- **3D 가상 룸** — VRM 아바타 + Mixamo 33종 애니메이션 (대기, 걷기, 감정, 제스처, 댄스)
- **자연스러운 대화** — Gemma 26B MoE 기반, 성격/기억/감정 추적
- **음성 출력** — ElevenLabs Voice Clone TTS (한/일/영/중/스/프 + 32개 언어)
- **음성 입력** — Whisper STT (자동 언어 감지)
- **웹 검색** — 실시간 팩트 검색 + 구조화된 결과 제공
- **다국어 지원** — 한국어, 일본어, 영어, 중국어 — UI 및 대화 모두
- **아바타 랩** — VRM 모델 + Mixamo FBX 애니메이션 테스트

## 시작하기

1. **[라이브 데모](https://nskit-io.github.io/nvatar-demo/)** 열기
2. **캐릭터 모델** 그리드에서 원하는 VRM 선택
3. 아바타 **이름** 입력
4. **성격**과 **언어** 선택
5. **Create Avatar** 클릭 → 룸에 입장!

### 룸 안에서

| 기능 | 사용법 |
|------|--------|
| **채팅** | 입력창에 메시지 입력 → 전송 (또는 Enter) |
| **음성 입력** | 🎤 버튼 클릭 → 녹음 → 자동 인식 → 자동 전송 |
| **아바타 이동** | 바닥 아무 곳이나 더블클릭 |
| **언어 변경** | 사이드 패널 → 언어 선택 (대화 초기화됨) |
| **TTS 켜기/끄기** | 사이드 패널 → 🔊 TTS 토글 |
| **가구 배치** | 사이드 패널 → 책상, 선반, 조명, 화분 |
| **검색 결과** | 아바타가 검색하면 배지 표시 → 클릭하여 열람 |

### 팁

- 아바타는 **대화 내용을 기억**하며 시간이 지날수록 성격이 발전합니다
- "오늘 환율 얼마야?" 같은 팩트 질문을 하면 검색해줍니다
- 대화 중에 언어를 바꿔도 아바타가 자연스럽게 적응합니다
- 사용자당 최대 **3개 아바타** — 오래된 것을 삭제하고 새로 만들 수 있습니다

## 기술 스택

| 구성요소 | 기술 |
|---------|------|
| AI 모델 | Gemma 4 26B MoE (4-bit, Apple Silicon MLX) |
| TTS | ElevenLabs Voice Clone (turbo v2.5) |
| STT | Whisper large-v3 (MLX) |
| 3D | Three.js + @pixiv/three-vrm + Mixamo FBX |
| 검색 | CSW (Claude) WebSearch 하이브리드 |
| 백엔드 | Python FastAPI + WebSocket |

## 자체 서버 운영

이 데모는 `nvatar.nskit.io`에 연결됩니다. 자체 NVatar 서버를 운영하고 싶으시다면 문의해주세요.

## 라이선스

MIT — 데모 코드에 한정. VRM 모델은 개별 라이선스 적용. Mixamo 애니메이션은 API로 제공 (재배포 아님).

## 연락처

- GitHub: [@nskit-io](https://github.com/nskit-io)
- 제작: [Neoulsoft](https://neoulsoft.com)
