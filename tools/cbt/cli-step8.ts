// STEP 8 — CLI (STEP 8 §23). 단일 ID만 처리한다. 대량 loop 없음.
//
//   npm run cbt:generate -- --candidateId=<uuid> [--llm-facts]
//   npm run cbt:review   -- --id=<uuid> --approve|--reject [--reviewer=<name>]
//   npm run cbt:promote  -- --id=<uuid>
//
// generate는 provider fail-closed preflight(API key/baseUrl/model)를 DB 조회/write 전에
// 실행한다. 유효하지 않으면 거부하며 Mock으로 대체하지 않는다. 진단 출력을 제공한다.
import "dotenv/config";
import type { CandidateQuestion } from "@/generated/prisma/client";
import { runContentProduction } from "./content/pipeline";
import { reviewGeneratedQuestion, type ReviewAction } from "./content/review";
import { promoteToMaster } from "./content/promotion";
import { createConfiguredProvider } from "./content/provider";
import {
  findGeneratedQuestionById,
  findMasterByGeneratedQuestionId,
  getDefaultContentDb,
} from "./content/persist/content-repository";

type CliArgs = {
  command?: string;
  candidateId?: string;
  id?: string;
  approve?: boolean;
  reject?: boolean;
  reviewer?: string;
  llmFacts?: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const positional: string[] = [];
  for (const token of argv) {
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        const key = token.slice(2, eq);
        const value = token.slice(eq + 1);
        if (key === "candidateId") args.candidateId = value;
        if (key === "id") args.id = value;
        if (key === "reviewer") args.reviewer = value;
      } else {
        const key = token.slice(2);
        if (key === "approve") args.approve = true;
        if (key === "reject") args.reject = true;
        if (key === "llm-facts") args.llmFacts = true;
      }
    } else {
      positional.push(token);
    }
  }
  if (positional.length > 0) args.command = positional[0];
  return args;
}

function provenanceLine(candidate: CandidateQuestion): string {
  return [
    `  candidate: ${candidate.id}`,
    `  sourceName: ${candidate.sourceName}`,
    `  sourceQuestionId: ${candidate.sourceQuestionId}`,
    `  originalUrl: ${candidate.originalUrl ?? "(없음)"}`,
    `  fetchedAt: ${candidate.fetchedAt?.toISOString() ?? "(없음)"}`,
    `  rawHtmlSnippetId: ${candidate.rawHtmlSnippetId ?? "(없음)"}`,
  ].join("\n");
}

async function cmdGenerate(args: CliArgs): Promise<void> {
  if (!args.candidateId) {
    throw new Error("--candidateId=<uuid> 가 필요합니다.");
  }
  // DB 조회/쓰기 전 provider fail-closed preflight (API key/baseUrl/model guard).
  const provider = createConfiguredProvider();
  const db = await getDefaultContentDb();
  const result = await runContentProduction(
    { candidateId: args.candidateId, llmFacts: args.llmFacts },
    { db, provider },
  );

  console.log("[cbt:generate] 완료");
  console.log(`  generatedQuestionId: ${result.generatedQuestionId}`);
  console.log(`  status: ${result.status}`);
  console.log(`  qaPassed: ${result.qaPassed} / qaFailed: ${result.qaFailed}`);
  console.log(
    `  similarityScore: ${result.similarityScore?.toFixed(4) ?? "null"} ` +
      `/ similarityWarning: ${result.similarityWarning}`,
  );
  console.log(`  errorCode: ${result.errorCode ?? "(없음)"}`);
  console.log("  provenance:");
  const candidate = await db.candidateQuestion.findUnique({
    where: { id: args.candidateId },
  });
  if (candidate) console.log(provenanceLine(candidate));
}

async function cmdReview(args: CliArgs): Promise<void> {
  if (!args.id) throw new Error("--id=<uuid> 가 필요합니다.");
  if (args.approve === args.reject) {
    throw new Error("--approve 또는 --reject 중 하나만 지정해야 합니다.");
  }
  const action: ReviewAction = args.approve ? "approve" : "reject";
  const db = await getDefaultContentDb();
  const outcome = await reviewGeneratedQuestion(db, args.id, action, args.reviewer);
  console.log(
    `[cbt:review] ${outcome.action} 완료 → ${outcome.status}` +
      (outcome.alreadyResolved ? " (이미 반영됨)" : ""),
  );
  console.log(`  id: ${outcome.id}`);
}

async function cmdPromote(args: CliArgs): Promise<void> {
  if (!args.id) throw new Error("--id=<uuid> 가 필요합니다.");
  const db = await getDefaultContentDb();
  const outcome = await promoteToMaster(db, args.id);

  console.log(
    `[cbt:promote] ${outcome.created ? "승격 완료" : "이미 승격됨 (idempotent)"}`,
  );
  console.log(`  masterQuestionId: ${outcome.masterQuestionId}`);

  const master = await findMasterByGeneratedQuestionId(db, args.id);
  const generated = await findGeneratedQuestionById(db, args.id);
  if (generated) {
    console.log("  provenance:");
    const candidate = await db.candidateQuestion.findUnique({
      where: { id: generated.candidateQuestionId },
    });
    if (candidate) console.log(provenanceLine(candidate));
    console.log(`  generatedQuestionId: ${generated.id}`);
  }
  if (master) {
    console.log(`  publishedAt: ${master.publishedAt?.toISOString() ?? "(없음)"}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command) {
    console.error("사용법:");
    console.error("  npm run cbt:generate -- --candidateId=<uuid> [--llm-facts]");
    console.error("  npm run cbt:review -- --id=<uuid> --approve|--reject [--reviewer=<name>]");
    console.error("  npm run cbt:promote -- --id=<uuid>");
    process.exitCode = 1;
    return;
  }

  switch (args.command) {
    case "generate":
      await cmdGenerate(args);
      break;
    case "review":
      await cmdReview(args);
      break;
    case "promote":
      await cmdPromote(args);
      break;
    default:
      console.error(`알 수 없는 명령: ${args.command}`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("STEP 8 CLI 실패:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
