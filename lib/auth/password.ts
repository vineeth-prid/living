import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// scrypt from node:crypto rather than argon2/bcrypt: it's memory-hard, in the
// stdlib, and needs no native build step on the Windows box this deploys from.
// N=2^15 keeps a hash near ~100ms on commodity hardware.
const PARAMS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

/** Returns "scrypt$N$r$p$salt$hash" — self-describing so params can change. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, PARAMS);
  return [
    "scrypt",
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt") return false;

  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(
    password.normalize("NFKC"),
    Buffer.from(salt, "base64"),
    expected.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 },
  );
  // Lengths match by construction above, so timingSafeEqual can't throw.
  return timingSafeEqual(actual, expected);
}

/** Temporary password for a newly created or reset employee account. */
export const generatePassword = () =>
  randomBytes(9).toString("base64url").slice(0, 12);
