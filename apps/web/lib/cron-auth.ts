import { timingSafeEqual } from "node:crypto";

/**
 * True if `request` carries `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron sends when
 * the variable is set. Without a secret configured, nobody is allowed: a cron route must never
 * be open to the public. The comparison takes the same time whatever the input.
 */
export function isCronRequest(request: Request, secret: string | undefined): boolean {
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
