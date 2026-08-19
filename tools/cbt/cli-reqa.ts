// QA v3 실측 CLI — 기존 GeneratedQuestion 대상 QA v3 append-only 재실행.
//
//   npx tsx tools/cbt/cli-reqa.ts --dry-run            # LLM 0, DB write 0
//   npx tsx tools/cbt/cli-reqa.ts --run                # QA v3 실측 (concurrency=1)
//   npx tsx tools/cbt/cli-reqa.ts --report             # 집계 + DB 안전성 diff
//   npx tsx tools/cbt/cli-reqa.ts --run --ids=<uuid>,<uuid>   # 대상 오버라이드
//
// 안전 원칙:
// - GeneratedQuestion.status / MasterQuestion / CandidateQuestion 변경 금지.
// - DB write는 generated_question_qas에 QA v3 결과 INSERT만 허용.
// - 기존 QA 결과 overwrite/삭제 금지.
// - 기본 대상은 REQA_TARGETS(38건). --ids로 오버라이드 가능.
// - concurrency=1 고정, transient retry 최대 1회(attempt 2회 초과 시 skip).
import "dotenv/config";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { REQA_TARGETS } from "./reqa-targets";
import type { ReQaGroup, ReQaExpected } from "./reqa-targets";
import {
  AUTO_QA_PROMPT_VERSION,
  getDefaultReQaDb,
  runReQaBatch,
  captureDbSnapshot,
  diffDbSnapshots,
  isTransientErrorCode,
} from "./content/reqa";
import type { DbSnapshot, ReQaDb, ReQaItemResult } from "./content/reqa";
import { createDefaultProvider } from "./content/provider";

const SNAPSHOT_FILE = path.join("data", "cbt", "qa-v3-snapshot-before.json");
const RESULT_FILE = path.join("data", "cbt", "qa-v3-results.json");
const REPORT_FILE = path.join("data", "cbt", "qa-v3-report.json");

type CliArgs = {
  dryRun: boolean;
  run: boolean;
  report: boolean;
  ids: string[];
};

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    run: false,
    report: false,
    ids: [],
  };
  for (const token of argv) {
    if (token === "--dry-run") args.dryRun = true;
    if (token === "--run") args.run = true;
    if (token === "--report") args.report = true;
    if (token.startsWith("--ids=")) {
      args.ids = token.slice("--ids=".length)
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }
  }
  return args;
}

function defaultTargetIds(): string[] {
  return REQA_TARGETS.map((t) => t.generatedQuestionId);
}

async function writeResults(results: ReQaItemResult[]): Promise<void> {
  writeFileSync(
    RESULT_FILE,
    JSON.stringify(
      { writtenAt: new Date().toISOString(), results },
      null,
      2,
    ),
    "utf-8",
  );
}

function printTable(results: ReQaItemResult[], headers: string[]): void {
  const widths = headers.map((h) => h.length);
  const rows: string[][] = [];
  for (const r of results) {
    const row = [
      r.sourceQuestionId ?? "-",
      r.generatedQuestionId,
      r.category ?? "-",
      r.currentStatus ?? "-",
      r.guardReason,
      r.attemptNumber === null ? "-" : String(r.attemptNumber),
      r.executed ? (r.qaPassed === null ? "TRANSIENT" : r.qaPassed ? "PASS" : "FAIL") : "-",
      r.errorCode ?? "-",
    ];
    rows.push(row);
  }
  for (let c = 0; c < headers.length; c += 1) {
    for (const row of rows) {
      widths[c] = Math.max(widths[c], String(row[c] ?? "").length);
    }
  }
  const pad = (s: string, w: number) => s.padEnd(w);
  const headerLine = headers.map((h, i) => pad(h, widths[i])).join("  ");
  console.log(headerLine);
  console.log(headers.map((_, i) => "-".repeat(widths[i])).join("  "));
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(String(cell ?? ""), widths[i])).join("  "));
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// dry-run / run
// ---------------------------------------------------------------------------

async function runMode(args: CliArgs, dryRun: boolean): Promise<void> {
  const db = await getDefaultReQaDb();
  const ids = args.ids.length > 0 ? args.ids : defaultTargetIds();
  const provider = dryRun ? createDefaultProvider() : createDefaultProvider();

  if (!dryRun) {
    const before = await captureDbSnapshot(db);
    writeFileSync(SNAPSHOT_FILE, JSON.stringify(before, null, 2), "utf-8");
    console.log(`[snapshot] before 저장: ${SNAPSHOT_FILE}`);
  }

  console.log(
    `[re-qa] mode=${dryRun ? "dry-run" : "run"} targets=${ids.length} provider=${provider.provider}/${provider.model}`,
  );
  console.log(`[re-qa] QA version: ${AUTO_QA_PROMPT_VERSION}`);

  const batch = await runReQaBatch(
    { generatedQuestionIds: ids, dryRun },
    { db, provider },
  );

  printTable(
    batch.results,
    ["src", "generatedQuestionId", "cat", "status", "guard", "attempt", "v3", "error"],
  );

  console.log(
    `[re-qa] 완료: total=${batch.total} executed=${batch.executed} skipped=${batch.skipped} (${batch.durationMs}ms)`,
  );

  const guardCounts = new Map<string, number>();
  for (const r of batch.results) {
    guardCounts.set(r.guardReason, (guardCounts.get(r.guardReason) ?? 0) + 1);
  }
  console.log(`[re-qa] guard 분포: ${[...guardCounts.entries()].map(([k, v]) => `${k}=${v}`).join(" ")}`);

  if (dryRun) {
    writeResults(batch.results);
  } else {
    writeResults(batch.results);
  }
  console.log(`[re-qa] 결과 export: ${RESULT_FILE}`);
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

type ReportItem = {
  sourceQuestionId: string | null;
  generatedQuestionId: string;
  group: ReQaGroup | null;
  expected: ReQaExpected | null;
  v2Pass: boolean | null;
  v3Pass: boolean | null;
  v3CriticalFlaws: string[] | null;
  v3Hallucination: boolean | null;
  v3ErrorCode: string | null;
  v3Attempts: number;
  v3TransientCount: number;
};

async function collectReport(db: ReQaDb): Promise<ReportItem[]> {
  const items: ReportItem[] = [];
  for (const target of REQA_TARGETS) {
    const generated = await db.generatedQuestion.findUnique({
      where: { id: target.generatedQuestionId },
    });
    if (!generated) {
      items.push({
        sourceQuestionId: target.sourceQuestionId,
        generatedQuestionId: target.generatedQuestionId,
        group: target.group,
        expected: target.expected,
        v2Pass: null,
        v3Pass: null,
        v3CriticalFlaws: null,
        v3Hallucination: null,
        v3ErrorCode: null,
        v3Attempts: 0,
        v3TransientCount: 0,
      });
      continue;
    }
    const candidate = await db.candidateQuestion.findUnique({
      where: { id: generated.candidateQuestionId },
    });

    const v3Rows = await db.generatedQuestionQA.findMany({
      where: { generatedQuestionId: target.generatedQuestionId, promptVersion: AUTO_QA_PROMPT_VERSION },
      orderBy: { createdAt: "asc" },
    });
    const v2Rows = await db.generatedQuestionQA.findMany({
      where: { generatedQuestionId: target.generatedQuestionId, promptVersion: "step8-auto-qa-v2" },
      orderBy: { createdAt: "asc" },
    });
    const v1Rows = await db.generatedQuestionQA.findMany({
      where: { generatedQuestionId: target.generatedQuestionId, promptVersion: "step8-auto-qa-v1" },
      orderBy: { createdAt: "asc" },
    });

    const latestV2 = [...v1Rows, ...v2Rows].pop() ?? null;
    const semanticV3 = [...v3Rows].reverse().find((r) => r.isPass !== null) ?? null;
    const lastV3 = [...v3Rows].pop() ?? null;
    const v3Pass = semanticV3 ? (semanticV3.isPass === true ? true : false) : null;
    const v3ErrorCode = semanticV3 ? null : (lastV3?.errorCode ?? null);

    items.push({
      sourceQuestionId: candidate?.sourceQuestionId ?? target.sourceQuestionId,
      generatedQuestionId: target.generatedQuestionId,
      group: target.group,
      expected: target.expected,
      v2Pass: latestV2?.isPass ?? null,
      v3Pass,
      v3CriticalFlaws: semanticV3
        ? ((semanticV3.criticalFlaws as unknown) as string[] | null)
        : null,
      v3Hallucination: semanticV3?.hasHallucination ?? null,
      v3ErrorCode,
      v3Attempts: v3Rows.length,
      v3TransientCount: v3Rows.filter((r) => r.errorCode !== null).length,
    });
  }
  return items;
}

async function runReport(): Promise<void> {
  const db = await getDefaultReQaDb();
  const items = await collectReport(db);

  // DB 안전성 diff
  let safety: { ok: boolean; detail: string } = { ok: true, detail: "(snapshot 없음)" };
  if (existsSync(SNAPSHOT_FILE)) {
    const before = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf-8")) as DbSnapshot;
    const after = await captureDbSnapshot(db);
    const diff = diffDbSnapshots(before, after);
    safety = {
      ok:
        diff.generatedQuestionModified === 0 &&
        diff.masterQuestionModified === 0 &&
        diff.candidateQuestionModified === 0,
      detail:
        `GeneratedQuestion 변경 ${diff.generatedQuestionModified}건, ` +
        `MasterQuestion 변경 ${diff.masterQuestionModified}건, ` +
        `CandidateQuestion 변경 ${diff.candidateQuestionModified}건, ` +
        `generated_question_qas 증가 ${diff.qaCountDelta}건`,
    };
  }

  // 표 출력
  const headers = [
    "src",
    "group",
    "expected",
    "v2",
    "v3",
    "flaws",
    "hallu",
    "error",
    "attempts",
  ];
  const widths = headers.map((h) => h.length);
  const rows: string[][] = [];
  for (const it of items) {
    const row = [
      it.sourceQuestionId ?? "-",
      it.group ?? "-",
      it.expected ?? "-",
      it.v2Pass === null ? "-" : it.v2Pass ? "PASS" : "FAIL",
      it.v3Pass === null
        ? isTransientErrorCode(it.v3ErrorCode)
          ? "TRANSIENT"
          : "-"
        : it.v3Pass
          ? "PASS"
          : "FAIL",
      it.v3CriticalFlaws ? String(it.v3CriticalFlaws.length) : "-",
      it.v3Hallucination === null ? "-" : String(it.v3Hallucination),
      it.v3ErrorCode ?? "-",
      String(it.v3Attempts),
    ];
    rows.push(row);
  }
  for (let c = 0; c < headers.length; c += 1) {
    for (const row of rows) widths[c] = Math.max(widths[c], String(row[c] ?? "").length);
  }
  const pad = (s: string, w: number) => String(s).padEnd(w);
  console.log(headers.map((h, i) => pad(h, widths[i])).join("  "));
  console.log(headers.map((_, i) => "-".repeat(widths[i])).join("  "));
  for (const row of rows) {
    console.log(row.map((cell, i) => pad(cell, widths[i])).join("  "));
  }
  console.log("");

  // 집계
  const failGroup = items.filter((it) => it.group === "must-fail");
  const passGroup = items.filter((it) => it.group === "must-pass");
  const adjGroup = items.filter((it) => it.group === "adjudicated-fail");
  const edgeGroup = items.filter((it) => it.group === "edge");

  const valid = (it: ReportItem) => !isTransientErrorCode(it.v3ErrorCode);

  const mustFailSemantic = failGroup.filter(valid);
  const mustFailPassed = mustFailSemantic.filter((it) => it.v3Pass === true);
  const mustFailFailed = mustFailSemantic.filter((it) => it.v3Pass === false);
  const mustFailTransient = failGroup.filter((it) => !valid(it));

  const mustPassSemantic = passGroup.filter(valid);
  const mustPassPassed = mustPassSemantic.filter((it) => it.v3Pass === true);
  const mustPassFailed = mustPassSemantic.filter((it) => it.v3Pass === false);
  const mustPassTransient = passGroup.filter((it) => !valid(it));

  const adjSemantic = adjGroup.filter(valid);
  const adjPassed = adjSemantic.filter((it) => it.v3Pass === true);
  const adjFailed = adjSemantic.filter((it) => it.v3Pass === false);
  const adjTransient = adjGroup.filter((it) => !valid(it));

  const edgeSemantic = edgeGroup.filter(valid);

  console.log("=== QA v3 실측 집계 ===");
  console.log(`Must FAIL        : ${mustFailFailed.length}/${mustFailSemantic.length} FAIL (false-positive ${mustFailPassed.length}, transient ${mustFailTransient.length})`);
  console.log(`Adjudicated FAIL : ${adjFailed.length}/${adjSemantic.length} FAIL (false-${adjPassed.length}, transient ${adjTransient.length})`);
  console.log(`Must PASS        : ${mustPassPassed.length}/${mustPassSemantic.length} PASS (false-rejection ${mustPassFailed.length}, transient ${mustPassTransient.length})`);
  console.log(`Edge        : ${edgeSemantic.map((it) => `${it.sourceQuestionId}=${it.v3Pass === null ? (it.v3ErrorCode ?? "?") : it.v3Pass ? "PASS" : "FAIL"}`).join(", ")}`);
  console.log(`유효 표본   : ${mustFailSemantic.length + mustPassSemantic.length + adjSemantic.length + edgeSemantic.length}/38 (transient 제외)`);
  console.log("");
  console.log(`DB 안전성   : ${safety.ok ? "OK" : "VIOLATION"} — ${safety.detail}`);

  const report = {
    writtenAt: new Date().toISOString(),
    safety,
    items,
    summary: {
      mustFailFailed: mustFailFailed.map((i) => i.sourceQuestionId),
      mustFailPassed: mustFailPassed.map((i) => i.sourceQuestionId),
      mustFailTransient: mustFailTransient.map((i) => i.sourceQuestionId),
      mustPassPassed: mustPassPassed.map((i) => i.sourceQuestionId),
      mustPassFailed: mustPassFailed.map((i) => i.sourceQuestionId),
      mustPassTransient: mustPassTransient.map((i) => i.sourceQuestionId),
      adjudicatedFailed: adjFailed.map((i) => i.sourceQuestionId),
      adjudicatedPassed: adjPassed.map((i) => i.sourceQuestionId),
      adjudicatedTransient: adjTransient.map((i) => i.sourceQuestionId),
      edge: edgeSemantic.map((i) => ({
        sourceQuestionId: i.sourceQuestionId,
        expected: i.expected,
        v3: i.v3Pass === null ? (i.v3ErrorCode ?? null) : i.v3Pass ? "PASS" : "FAIL",
      })),
      validSampleCount: mustFailSemantic.length + mustPassSemantic.length + adjSemantic.length + edgeSemantic.length,
    },
  };
  writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf-8");
  console.log(`[report] export: ${REPORT_FILE}`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const modes = [args.dryRun, args.run, args.report].filter(Boolean).length;
  if (modes === 0) {
    console.error("사용법: npx tsx tools/cbt/cli-reqa.ts --dry-run | --run | --report");
    process.exitCode = 1;
    return;
  }
  if (modes > 1) {
    console.error("--dry-run / --run / --report 중 하나만 지정해야 합니다.");
    process.exitCode = 1;
    return;
  }

  if (args.dryRun) await runMode(args, true);
  else if (args.run) await runMode(args, false);
  else await runReport();
}

main().catch((err) => {
  console.error(
    "cli-reqa 실패:",
    err instanceof Error ? err.message : err,
  );
  process.exitCode = 1;
});
