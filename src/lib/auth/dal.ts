import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type {
  CompanyMemberRole,
  CompanyMemberStatus,
  UserRole,
  UserStatus,
} from "@/generated/prisma/enums";
import { readSessionToken, verifySessionToken } from "./session";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  nickname: string | null;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
};

export type CompanyMembership = {
  companyId: string;
  companyName: string;
  role: CompanyMemberRole;
  status: CompanyMemberStatus;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      name: true,
      nickname: true,
      phone: true,
      role: true,
      status: true,
      createdAt: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt !== null || user.status !== "ACTIVE") {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    nickname: user.nickname,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) notFound();
  return user;
}

export const getCompanyMemberships = cache(
  async (userId: string): Promise<CompanyMembership[]> => {
    const memberships = await prisma.companyMember.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        companyId: true,
        role: true,
        status: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((membership) => ({
      companyId: membership.companyId,
      companyName: membership.company.name,
      role: membership.role,
      status: membership.status,
    }));
  },
);
