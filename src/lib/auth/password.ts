import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2;

type ParsedHash = {
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
};

function parseStoredHash(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;

  const [N, r, p, salt, hash] = parts.slice(1);
  const Nn = Number(N);
  const rn = Number(r);
  const pn = Number(p);

  if (!Number.isInteger(Nn) || Nn < 2 || (Nn & (Nn - 1)) !== 0) return null;
  if (!Number.isInteger(rn) || rn < 1 || rn > 32) return null;
  if (!Number.isInteger(pn) || pn < 1 || pn > 8) return null;

  return { N: Nn, r: rn, p: pn, salt, hash };
}

export function hashPassword(password: string): string {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const parsed = parseStoredHash(stored);
  if (!parsed) return false;

  const { N, r, p, salt, hash } = parsed;
  const expected = Buffer.from(hash, "base64");
  const actual = scryptSync(password, Buffer.from(salt, "base64"), expected.length, {
    N,
    r,
    p,
    maxmem: 128 * N * r * 2,
  });

  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
