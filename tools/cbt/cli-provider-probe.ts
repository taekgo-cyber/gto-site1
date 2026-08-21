// STEP 8 — DB-free provider readiness probe CLI.
//
//   npm run cbt:provider-probe -- --dry-run
//   npm run cbt:provider-probe -- --run
//
// - --dry-run / --run 중 정확히 하나가 필요하다 (둘 다 / 둘 다 없으면 usage 오류).
// - --dry-run : configured provider의 fail-closed config validation만 수행한다.
//   network 0 / DB 0 / runlog 0 / file write 0. provider/model만 안전히 출력한다.
// - --run     : --dry-run과 달리 실제 HTTP 호출을 1회 수행하는 명령이라는 점을
//   주석/출력으로 명시한다. 별도 사용자 승인 없이는 실행하지 않는다.
//   동일 configured endpoint/model을 사용하되 maxRetries=0을 적용해 정확히 1 HTTP attempt.
//   DB/Prisma/runlog import와 파일 write를 금지한다. 성공 시 exit 0, 실패 시 non-zero.
//   API key/Authorization/raw response/body/prompt 원문은 출력하지 않는다.
//
// readiness는 순간 점검일 뿐 batch 성공을 보장하지 않으며, Gate1 재실행의 필요조건이다.
import "dotenv/config";
import { z } from "zod";
import { parseBatchArgs, type ParsedArgs } from "./batch/args";
import { createBatchLogger, type BatchLogger } from "./batch/logger";
import {
  createConfiguredProvider,
  type ProviderRuntimeOverride,
} from "./content/provider";
import type { LlmProvider } from "./content/provider/types";

/** probe 전용 고정 promptVersion */
const PROBE_PROMPT_VERSION = "provider-readiness-v1";
/** probe --run이 사용하는 아주 작은 스키마 */
const PROBE_SCHEMA = z.object({ ok: z.boolean() });

/** 프로브 구성 주입 (테스트용). 기본은 실제 configured provider를 사용한다. */
export type ProviderProbeDeps = {
  createConfigured?: (
    overrides?: ProviderRuntimeOverride,
  ) => LlmProvider;
};

function printUsage(logger: BatchLogger): void {
  logger.error("사용법:");
  logger.error("  npm run cbt:provider-probe -- --dry-run");
  logger.error("  npm run cbt:provider-probe -- --run");
  logger.error(
    "  --dry-run과 --run 중 정확히 하나만 지정해야 합니다. --run은 실제 HTTP 호출을 수행합니다.",
  );
}

/**
 * probe 로직 실행. argv로부터 인자를 파싱해 실행하고 종료 코드를 반환한다.
 * 테스트에서 deps.createConfigured를 주입해 실제 HTTP 호출 없이 1회 attempt를 검증한다.
 */
export async function runProviderProbe(
  argv: string[],
  deps: ProviderProbeDeps = {},
  logger: BatchLogger = createBatchLogger("provider-probe"),
): Promise<number> {
  const args: ParsedArgs = parseBatchArgs(argv);
  const createConfigured = deps.createConfigured ?? createConfiguredProvider;

  const dryRun = args.flags.has("dry-run");
  const run = args.flags.has("run");

  if (dryRun === run) {
    // 둘 다 true 또는 둘 다 false → usage 오류 (exit 1)
    printUsage(logger);
    return 1;
  }

  if (dryRun) {
    // fail-closed config validation만 수행 (network/DB/runlog/file write 0).
    const provider = createConfigured();
    logger.info(`provider=${provider.provider} model=${provider.model}`);
    logger.info(
      "config validation ok (network 0, DB 0, runlog 0, file write 0)",
    );
    return 0;
  }

  // --run: 실제 HTTP 호출 1회를 수행.
  logger.warn(
    "provider-probe --run: 별도 사용자 승인이 있는 경우에만 실행하는 명령이며 실제 HTTP 호출(1회)을 수행합니다.",
  );
  const provider = createConfigured({ maxRetries: 0 });
  const result = await provider.generateStructured(
    'Respond with a JSON object: {"ok": true}',
    PROBE_SCHEMA,
    { promptVersion: PROBE_PROMPT_VERSION },
  );

  if (result.ok && result.data.ok) {
    logger.info(
      `readiness ok provider=${provider.provider} model=${provider.model}`,
    );
    return 0;
  }

  if (result.ok) {
    logger.error("readiness failed: unexpected ok with data.ok=false");
    return 1;
  }

  const err = result.error;
  logger.error(
    `readiness failed provider=${err.provider} model=${err.model} ` +
      `code=${err.code} status=${err.status ?? "-"} ` +
      `retryAfterMs=${err.retryAfterMs ?? "-"}` +
      (err.detail ? ` detail=${err.detail}` : ""),
  );
  return 1;
}

async function main(): Promise<void> {
  const code = await runProviderProbe(process.argv.slice(2)).catch((err) => {
    // 예기치 못한 오류도 non-zero. key/raw/body/prompt는 포함하지 않는다.
    const logger = createBatchLogger("provider-probe");
    logger.error(
      `provider-probe 실패: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  });
  process.exitCode = code;
}

main();
