// STEP 8 — AI Auto-QA (STEP 8 §14/§15).
// Generator와 분리된 독립 검수. 별도 system prompt를 사용한다.
// - QA 결과 중 pass=true라도 "AI QA 통과 = 법적으로 안전"으로 취급하지 않는다 (참고용).
// - isCopyrightSafe는 참고용 평가일 뿐이며 법적 판정이 아니다.
// - hasHallucination=true 또는 criticalFlaws 존재 시 pass를 강제로 false 처리한다 (결함 방어).
// - QA 실패/LLM 실패는 ok:false로 반환되어 No Drop으로 보존된다.
import type { CandidateContent, GeneratedContent, LlmFailure, QaEvaluation } from "./types";
import type { LlmProvider } from "./provider/types";
import { AUTO_QA_PROMPT_VERSION, QA_SCHEMA } from "./schemas";
import { buildAutoQaPrompt } from "./prompts";

export type QaOutcome =
  | {
      ok: true;
      evaluation: QaEvaluation;
      rawLlmResponse: string;
      promptVersion: string;
      provider: string;
      model: string;
    }
  | { ok: false; failure: LlmFailure };

function toQaEvaluation(
  raw: {
    criteria: QaEvaluation["criteria"];
    hasHallucination: boolean;
    isCopyrightSafe: boolean;
    criticalFlaws: string[];
    pass: boolean;
  },
): QaEvaluation {
  const criticalFlaws = raw.criticalFlaws ?? [];
  const hasCriticalFlaw =
    raw.hasHallucination === true || criticalFlaws.length > 0;
  return {
    criteria: raw.criteria,
    hasHallucination: raw.hasHallucination === true,
    isCopyrightSafe: raw.isCopyrightSafe === true,
    criticalFlaws,
    // 방어: 결함이 있으면 AI가 pass라고 반환해도 강제로 false
    pass: raw.pass === true && !hasCriticalFlaw,
  };
}

export async function runAutoQa(
  candidate: CandidateContent,
  content: GeneratedContent,
  provider: LlmProvider,
): Promise<QaOutcome> {
  const prompt = buildAutoQaPrompt(candidate, content);
  const result = await provider.generateStructured(
    prompt,
    QA_SCHEMA,
    { promptVersion: AUTO_QA_PROMPT_VERSION },
  );

  if (!result.ok) {
    return { ok: false, failure: result.error };
  }

  return {
    ok: true,
    evaluation: toQaEvaluation(result.data),
    rawLlmResponse: result.rawResponse,
    promptVersion: AUTO_QA_PROMPT_VERSION,
    provider: provider.provider,
    model: provider.model,
  };
}
