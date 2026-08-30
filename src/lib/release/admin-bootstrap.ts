import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma";
import {
  assertReleaseDatabaseIdentity,
  assertReleaseEvidenceId,
  assertReleaseMutationApproval,
  type ReleaseDatabaseIdentity,
  type ReleaseMutationApproval,
} from "./production-boundary";

export type ActiveAdminBootstrapInput = ReleaseDatabaseIdentity & ReleaseMutationApproval & {
  email: string;
  name: string;
  password: string;
  backupEvidenceId: string;
  restoreEvidenceId: string;
};

export type ActiveAdminBootstrapReport = {
  environment: ActiveAdminBootstrapInput["environment"];
  action: "CREATED" | "NO_OP";
  userId: string;
  email: string;
  role: "ADMIN";
  status: "ACTIVE";
  verified: true;
  releaseEvidence: {
    approvalId: string;
    backupEvidenceId: string;
    restoreEvidenceId: string;
  };
};

function normalizeInput(input: ActiveAdminBootstrapInput) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 191) {
    throw new Error("RELEASE_ADMIN_EMAIL_INVALID");
  }
  if (name.length < 2 || name.length > 80) throw new Error("RELEASE_ADMIN_NAME_INVALID");
  if (input.password.length < 16 || input.password.length > 256) {
    throw new Error("RELEASE_ADMIN_PASSWORD_INVALID");
  }
  return { email, name };
}

function assertActiveAdminRow(row: {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  status: string;
  deletedAt: Date | null;
}, expected: { email: string; name: string; password: string }): void {
  if (
    row.email !== expected.email ||
    row.name !== expected.name ||
    row.role !== "ADMIN" ||
    row.status !== "ACTIVE" ||
    row.deletedAt !== null ||
    !verifyPassword(expected.password, row.passwordHash)
  ) {
    throw new Error("RELEASE_ADMIN_EXISTING_CONFLICT");
  }
}

const adminSelect = {
  id: true,
  email: true,
  name: true,
  passwordHash: true,
  role: true,
  status: true,
  deletedAt: true,
} as const;

export async function bootstrapActiveAdmin(input: ActiveAdminBootstrapInput): Promise<ActiveAdminBootstrapReport> {
  assertReleaseDatabaseIdentity(input);
  assertReleaseMutationApproval(input);
  const backupEvidenceId = assertReleaseEvidenceId(input.backupEvidenceId, "RELEASE_ADMIN_BACKUP_EVIDENCE_INVALID");
  const restoreEvidenceId = assertReleaseEvidenceId(input.restoreEvidenceId, "RELEASE_ADMIN_RESTORE_EVIDENCE_INVALID");
  const normalized = normalizeInput(input);

  const existing = await prisma.user.findUnique({ where: { email: normalized.email }, select: adminSelect });
  if (existing) {
    assertActiveAdminRow(existing, { ...normalized, password: input.password });
    return {
      environment: input.environment,
      action: "NO_OP",
      userId: existing.id,
      email: existing.email,
      role: "ADMIN",
      status: "ACTIVE",
      verified: true,
      releaseEvidence: { approvalId: input.approvalId.trim(), backupEvidenceId, restoreEvidenceId },
    };
  }

  const created = await prisma.user.create({
    data: {
      email: normalized.email,
      name: normalized.name,
      passwordHash: hashPassword(input.password),
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  const readBack = await prisma.user.findUnique({ where: { id: created.id }, select: adminSelect });
  if (!readBack) throw new Error("RELEASE_ADMIN_READ_BACK_MISSING");
  assertActiveAdminRow(readBack, { ...normalized, password: input.password });

  return {
    environment: input.environment,
    action: "CREATED",
    userId: readBack.id,
    email: readBack.email,
    role: "ADMIN",
    status: "ACTIVE",
    verified: true,
    releaseEvidence: { approvalId: input.approvalId.trim(), backupEvidenceId, restoreEvidenceId },
  };
}
