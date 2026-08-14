// STEP 8 — Question Generation (STEP 8 §11).
// 추출된 facts만을 입력으로 새 문제를 생성한다. 결과는 검증을 통과한 것만 반환한다.
// 생성 실패/검증 실패는 ok:false로 반환되며, 호출부가 FAILED GeneratedQuestion으로 보존한다 (No Drop).
import type { CandidateContent, FactExtractionResult, GeneratedContent, LlmFailure } from "./types";
import type { LlmProvider } from "./provider/types";
import { GENERATED_QUESTION_SCHEMA, QUESTION_GENERATION_PROMPT_VERSION } from "./schemas";
import { buildQuestionGenerationPrompt } from "./prompts";
import { assessGeneratedContent } from "./validate";
import { computeSimilarity } from "./similarity";

export type GenerateOutcome =
  | {
      ok: true;
      content: GeneratedContent;
      rawLlmResponse: string;
      promptVersion: string;
      provider: string;
      model: string;
      similarityScore: number;
      similarityWarning: boolean;
    }
  | { ok: false; failure: LlmFailure };

export async function generateQuestionFromFacts(
  candidate: CandidateContent,
  facts: FactExtractionResult,
  provider: LlmProvider,
): Promise<GenerateOutcome> {
  const prompt = buildQuestionGenerationPrompt(
    candidate,
    facts.facts,
    facts.correctAnswerBasis,
    facts.constraints,
  );

  const result = await provider.generateStructured(
    prompt,
    GENERATED_QUESTION_SCHEMA,
    { promptVersion: QUESTION_GENERATION_PROMPT_VERSION },
  );

  const meta = {
    provider: result.ok
      ? provider.provider
      : result.error.provider,
    model: result.ok ? provider.model : result.error.model,
    promptVersion: QUESTION_GENERATION_PROMPT_VERSION,
  };

  if (!result.ok) {
    return { ok: false, failure: result.error };
  }

  const assessed = assessGeneratedContent(result.data);
  if (!assessed.ok) {
    return {
      ok: false,
      failure: {
        code: "content_invalid",
        message: `생성 콘텐츠 검증 실패: ${assessed.errors.join(", ")}`,
        rawResponse: result.rawResponse,
        ...meta,
      },
    };
  }

  const sourceText = [
    candidate.questionText,
    ...candidate.choices.map((c) => c.text),
    candidate.explanation ?? "",
  ].join("\n");
  const generatedText = [
    assessed.content.questionText,
    ...assessed.content.choices.map((c) => c.text),
    assessed.content.explanation,
  ].join("\n");
  const similarity = computeSimilarity(generatedText, sourceText);

  return {
    ok: true,
    content: assessed.content,
    rawLlmResponse: result.rawResponse,
    ...meta,
    similarityScore: similarity.score,
    similarityWarning: similarity.warning,
  };
}
