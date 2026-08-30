import "dotenv/config";
import { bootstrapActiveAdmin } from "../../src/lib/release/admin-bootstrap";
import { RELEASE_MUTATION_ACK } from "../../src/lib/release/production-boundary";

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

function parseArgs(argv: string[]) {
  const environment = valueAfter(argv, "--environment");
  const expectedDatabaseHost = valueAfter(argv, "--expected-db-host");
  const expectedDatabaseName = valueAfter(argv, "--expected-db-name");
  const email = valueAfter(argv, "--email");
  const name = valueAfter(argv, "--name");
  const approvalId = valueAfter(argv, "--approval-id");
  const backupEvidenceId = valueAfter(argv, "--backup-evidence-id");
  const restoreEvidenceId = valueAfter(argv, "--restore-evidence-id");
  const acknowledgement = valueAfter(argv, "--ack");
  if (
    (environment !== "disposable" && environment !== "production") ||
    !expectedDatabaseHost ||
    !expectedDatabaseName ||
    !email ||
    !name ||
    !approvalId ||
    !backupEvidenceId ||
    !restoreEvidenceId ||
    !acknowledgement
  ) {
    throw new Error("RELEASE_ADMIN_BOOTSTRAP_ARGS_REQUIRED");
  }
  return { environment, expectedDatabaseHost, expectedDatabaseName, email, name, approvalId, backupEvidenceId, restoreEvidenceId, acknowledgement } as const;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const password = process.env.RELEASE_ADMIN_BOOTSTRAP_PASSWORD ?? "";
  if (!password) throw new Error("RELEASE_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED");

  const report = await bootstrapActiveAdmin({ ...args, password });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "RELEASE_ADMIN_BOOTSTRAP_FAILED";
  process.stderr.write(`${message}\n`);
  if (message === "RELEASE_MUTATION_ACK_REQUIRED") {
    process.stderr.write(`Expected acknowledgement: ${RELEASE_MUTATION_ACK}\n`);
  }
  process.exitCode = 1;
});
