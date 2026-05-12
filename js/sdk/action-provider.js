// NVatar SDK Chat — Action Provider interface (R&D stub).
//
// 향후 호스트 앱이 자기 서비스 기능(액션)을 SDK 에 등록하면, 아바타가 그것을 인지해서
// 데이터 추출/큐레이션/대화 소재로 활용하는 hook 자리.
//
// 본 사이클은 인터페이스 자리만 깔아두고 본격 설계는 추후.
//
// 후보 hook 시점 (TBD):
//   - beforeSend(text, ctx)          : 사용자 메시지 전송 직전 (의도 사전 분류, 컨텍스트 첨부)
//   - onIntent(intent, ctx)          : 아바타가 외부 액션 의도 표명 시 (예: "오늘 일정 보여줘")
//   - afterAssistant(bubble, ctx)    : 어시스턴트 응답 도착 후 (사후 큐레이션, UI 보강)
//
// ctx 후보: { persona, mbti, emotions, recentMessages, hostState }

/**
 * Minimal interface. Override any/all hooks; return undefined to no-op.
 */
export class ActionProvider {
  /** @returns {Promise<void> | void} */
  async beforeSend(text, ctx) { /* override */ }
  async onIntent(intent, ctx) { /* override */ }
  async afterAssistant(bubble, ctx) { /* override */ }
}

/** Default no-op provider — SDK 가 별도 provider 없이 동작하도록. */
export class NoopActionProvider extends ActionProvider {}
