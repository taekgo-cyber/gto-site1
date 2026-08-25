"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createInAppNotification } from "@/lib/notifications/service";
import { requireUser } from "./dal";
import { hashPassword, verifyPassword } from "./password";
import {
  createSessionToken,
  deleteSessionCookie,
  setSessionCookie,
} from "./session";
import {
  validateLogin,
  validatePasswordChange,
  validateProfile,
  validateSignup,
  type FieldErrors,
} from "./validation";

export type FormState =
  | {
      fieldErrors?: FieldErrors;
      formError?: string;
      success?: boolean;
      message?: string;
    }
  | undefined;

export async function signup(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { errors, data } = validateSignup(formData);
  if (!data) return { fieldErrors: errors };

  const [existingEmail, existingNickname] = await Promise.all([
    prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true },
    }),
    prisma.user.findUnique({
      where: { nickname: data.nickname },
      select: { id: true },
    }),
  ]);

  const fieldErrors: FieldErrors = { ...errors };
  if (existingEmail) fieldErrors.email = "이미 가입된 이메일입니다.";
  if (existingNickname) fieldErrors.nickname = "이미 사용 중인 닉네임입니다.";
  if (Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const passwordHash = hashPassword(data.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        name: data.name,
        nickname: data.nickname,
        passwordHash,
        role: "USER",
        status: "ACTIVE",
      },
      select: { id: true, role: true },
    });
    await createInAppNotification({
      userId: created.id,
      type: "SYSTEM",
      title: "트럭포털 가입을 환영합니다",
      body: "마이페이지에서 내 정보와 서비스 이용 현황을 확인할 수 있습니다.",
      href: "/mypage",
      dedupeKey: `signup:${created.id}:welcome`,
    }, tx);
    return created;
  });

  await setSessionCookie(createSessionToken(user));
  redirect("/mypage");
}

export async function login(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { errors, data } = validateLogin(formData);
  if (!data) return { fieldErrors: errors };

  const user = await prisma.user.findUnique({
    where: { email: data.email },
    select: {
      id: true,
      passwordHash: true,
      role: true,
      status: true,
      deletedAt: true,
    },
  });

  if (
    !user ||
    user.status !== "ACTIVE" ||
    user.deletedAt !== null ||
    !verifyPassword(data.password, user.passwordHash)
  ) {
    return { formError: "이메일 또는 비밀번호가 올바르지 않습니다." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  await setSessionCookie(createSessionToken(user));
  redirect("/mypage");
}

export async function logout(): Promise<void> {
  await deleteSessionCookie();
  redirect("/");
}

export async function updateProfile(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const { errors, data } = validateProfile(formData);
  if (!data) return { fieldErrors: errors };

  const duplicate = await prisma.user.findUnique({
    where: { nickname: data.nickname },
    select: { id: true },
  });

  if (duplicate && duplicate.id !== user.id) {
    return { fieldErrors: { nickname: "이미 사용 중인 닉네임입니다." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { name: data.name, nickname: data.nickname, phone: data.phone || null },
  });

  return { success: true, message: "프로필이 저장되었습니다." };
}

export async function changePassword(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const { errors, data } = validatePasswordChange(formData);
  if (!data) return { fieldErrors: errors };

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!dbUser || !verifyPassword(data.currentPassword, dbUser.passwordHash)) {
    return { fieldErrors: { currentPassword: "현재 비밀번호가 올바르지 않습니다." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(data.newPassword) },
  });

  return { success: true, message: "비밀번호가 변경되었습니다." };
}

export async function withdraw(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser();

  const password = formData.get("password");
  if (typeof password !== "string" || !password) {
    return { fieldErrors: { password: "비밀번호를 입력해 주세요." } };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });

  if (!dbUser || !verifyPassword(password, dbUser.passwordHash)) {
    return { fieldErrors: { password: "비밀번호가 올바르지 않습니다." } };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      status: "WITHDRAWN",
      deletedAt: new Date(),
      email: `withdrawn-${user.id}@gto.local`,
      nickname: null,
      phone: null,
      name: "탈퇴한 사용자",
    },
  });

  await deleteSessionCookie();
  redirect("/");
}
