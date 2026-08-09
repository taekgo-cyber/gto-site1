import { prisma } from "@/lib/prisma";
import { readSessionToken, verifySessionToken } from "@/lib/auth/session";
import type { UserRole, UserStatus } from "@/generated/prisma/enums";
import { unauthorized } from "./errors";

export type ApiUser = {
  id: string;
  email: string;
  role: UserRole;
  status: UserStatus;
};

export async function getApiUser(): Promise<ApiUser | null> {
  const token = await readSessionToken();
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt !== null || user.status !== "ACTIVE") return null;

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
  };
}

export async function requireApiUser(): Promise<ApiUser> {
  const user = await getApiUser();
  if (!user) throw unauthorized();
  return user;
}
