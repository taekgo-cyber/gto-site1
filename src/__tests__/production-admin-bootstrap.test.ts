import { beforeEach, describe, expect, it, vi } from "vitest";
import { RELEASE_MUTATION_ACK } from "@/lib/release/production-boundary";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  create: vi.fn(),
  hashPassword: vi.fn((password: string) => `hashed:${password}`),
  verifyPassword: vi.fn((password: string, stored: string) => stored === `hashed:${password}`),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: mocks.findUnique, create: mocks.create } },
}));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}));

import { bootstrapActiveAdmin } from "@/lib/release/admin-bootstrap";

const base = {
  environment: "disposable" as const,
  expectedDatabaseHost: "127.0.0.1",
  expectedDatabaseName: "release_test",
  approvalId: "release-approval-001",
  backupEvidenceId: "backup-proof-001",
  restoreEvidenceId: "restore-proof-001",
  acknowledgement: RELEASE_MUTATION_ACK,
  email: "admin@example.com",
  name: "Release Admin",
  password: "very-strong-password-123",
};

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "admin-1",
    email: "admin@example.com",
    name: "Release Admin",
    passwordHash: "hashed:very-strong-password-123",
    role: "ADMIN",
    status: "ACTIVE",
    deletedAt: null,
    ...overrides,
  };
}

describe("Production release ACTIVE ADMIN bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    process.env.DATABASE_URL = "postgresql://user:pass@127.0.0.1:55433/release_test";
  });

  it("fails closed when the exact database identity does not match", async () => {
    await expect(bootstrapActiveAdmin({ ...base, expectedDatabaseName: "wrong" }))
      .rejects.toThrow("RELEASE_TARGET_IDENTITY_MISMATCH");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("requires the explicit mutation acknowledgement", async () => {
    await expect(bootstrapActiveAdmin({ ...base, acknowledgement: "no" }))
      .rejects.toThrow("RELEASE_MUTATION_ACK_REQUIRED");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("creates one ACTIVE ADMIN and verifies the read-back without returning password material", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(row());
    mocks.create.mockResolvedValue({ id: "admin-1" });

    const report = await bootstrapActiveAdmin(base);

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        email: "admin@example.com",
        name: "Release Admin",
        passwordHash: "hashed:very-strong-password-123",
        role: "ADMIN",
        status: "ACTIVE",
      }),
    }));
    expect(report).toEqual({
      environment: "disposable",
      action: "CREATED",
      userId: "admin-1",
      email: "admin@example.com",
      role: "ADMIN",
      status: "ACTIVE",
      verified: true,
      releaseEvidence: {
        approvalId: "release-approval-001",
        backupEvidenceId: "backup-proof-001",
        restoreEvidenceId: "restore-proof-001",
      },
    });
    expect(JSON.stringify(report)).not.toContain(base.password);
  });

  it("is idempotent only when the existing account is exactly the same ACTIVE ADMIN", async () => {
    mocks.findUnique.mockResolvedValue(row());
    const report = await bootstrapActiveAdmin(base);
    expect(report.action).toBe("NO_OP");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("never upgrades or overwrites an existing mismatched account", async () => {
    mocks.findUnique.mockResolvedValue(row({ role: "USER" }));
    await expect(bootstrapActiveAdmin(base)).rejects.toThrow("RELEASE_ADMIN_EXISTING_CONFLICT");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires non-loopback database identity in production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(bootstrapActiveAdmin({
      ...base,
      environment: "production",
      expectedDatabaseHost: "127.0.0.1",
    })).rejects.toThrow("RELEASE_PRODUCTION_DATABASE_LOOPBACK_FORBIDDEN");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});
