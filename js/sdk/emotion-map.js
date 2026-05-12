// NVatar SDK Chat — Emotion → VRM expression mapping.
//
// 백엔드 EmotionState (8 차원): joy, sadness, anger, anxiety, affection, excitement, boredom, trust
// VRM standard expressions:        happy, sad, angry, surprised, relaxed, neutral
//
// 정책:
//  - 가장 강한 1 감정 + 임계치 (>= 50). 나머지는 무시.
//  - 임계치 미만이면 neutral.
//  - 강도(intensity) 는 raw 값을 0~1 로 정규화 후 expression 키별 boost 적용.
//  - affection / excitement / trust 같은 보조 감정은 happy 로 fold (별도 VRM key 없음).

const PRIMARY_THRESHOLD = 50;

const EMOTION_TO_EXPR = {
  joy:        { key: 'happy',     boost: 1.0 },
  sadness:    { key: 'sad',       boost: 1.0 },
  anger:      { key: 'angry',     boost: 1.0 },
  anxiety:    { key: 'sad',       boost: 0.6 },   // 불안 → 슬픔 약하게
  affection:  { key: 'happy',     boost: 0.7 },
  excitement: { key: 'surprised', boost: 0.8 },
  boredom:    { key: 'relaxed',   boost: 0.6 },
  trust:      { key: 'relaxed',   boost: 0.4 },
};

/**
 * @param {object} emotions  e.g. { joy: 70, sadness: 20, anger: 5, ... }
 * @returns {{ expr: string, intensity: number }} VRM expression key + 0~1 intensity
 */
export function mapEmotionToExpression(emotions) {
  if (!emotions) return { expr: 'neutral', intensity: 0 };

  // Find dominant emotion
  let topName = null, topVal = -1;
  for (const [name, val] of Object.entries(emotions)) {
    if (typeof val !== 'number') continue;
    if (val > topVal) { topVal = val; topName = name; }
  }

  if (!topName || topVal < PRIMARY_THRESHOLD) return { expr: 'neutral', intensity: 0 };

  const mapping = EMOTION_TO_EXPR[topName];
  if (!mapping) return { expr: 'neutral', intensity: 0 };

  // Normalize: PRIMARY_THRESHOLD..100 → 0..1, then apply boost (capped at 1)
  const normalized = (topVal - PRIMARY_THRESHOLD) / (100 - PRIMARY_THRESHOLD);
  const intensity = Math.min(1, normalized * mapping.boost + 0.25);  // +0.25 floor so 50% feels present

  return { expr: mapping.key, intensity };
}
