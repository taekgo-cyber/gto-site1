import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MS,
  SESSION_MAX_AGE_SECONDS,
} from "./constants";

export type SessionPayload = {
  sub: string;
  role: string;
  iat: number;
  exp: number;
};

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET 환경변수가 필요합니다. (32자 이상의 랜덤 문자열)",
    );
  }
  return secret;
}

function hmac(payload: string): string {
  return createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

function decodePayload(body: string): unknown {
  return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
}

export function signSessionToken(payload: SessionPayload): string {
  const body = encodePayload(payload);
  return `${body}.${hmac(body)}`;
}

export function verifySessionToken(
  token: string | undefined | null,
): SessionPayload | null {
  if (!token) return null;

  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = Buffer.from(hmac(body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = decodePayload(body);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object") return null;

  const { sub, role, iat, exp } = parsed as Record<string, unknown>;
  if (typeof sub !== "string" || typeof exp !== "number") return null;
  if (exp < Date.now()) return null;

  return {
    sub,
    role: typeof role === "string" ? role : "USER",
    iat: typeof iat === "number" ? iat : Math.floor(Date.now() / 1000),
    exp,
  };
}

export function createSessionToken(user: {
  id: string;
  role: string;
}): string {
  const now = Date.now();
  return signSessionToken({
    sub: user.id,
    role: user.role,
    iat: Math.floor(now / 1000),
    exp: now + SESSION_MAX_AGE_MS,
  });
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function deleteSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function readSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE_NAME)?.value;
}
