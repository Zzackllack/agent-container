import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";

export async function authentication(state: string, secure: boolean) {
  await mkdir(state, { recursive: true, mode: 0o700 });
  const path = join(state, "password");
  try {
    await writeFile(path, randomBytes(24).toString("base64url") + "\n", {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const password = (await readFile(path, "utf8")).trim();
  if (password.length < 16)
    throw new Error("Dashboard password must contain at least 16 characters.");
  const hash = (value: string) => createHash("sha256").update(value).digest();
  const secret = hash(password).toString("hex");
  const cookie = "agent_dashboard";
  return {
    matches: (candidate: string) =>
      timingSafeEqual(hash(candidate), hash(password)),
    async authenticated(c: Context): Promise<boolean> {
      const value = await getSignedCookie(c, secret, cookie);
      if (!value) return false;
      const expires = Number(value);
      return Number.isFinite(expires) && expires > Date.now();
    },
    async login(c: Context): Promise<void> {
      await setSignedCookie(
        c,
        cookie,
        String(Date.now() + 12 * 60 * 60 * 1000),
        secret,
        {
          httpOnly: true,
          sameSite: "Strict",
          secure,
          path: "/",
          maxAge: 12 * 60 * 60,
        },
      );
    },
    logout(c: Context): void {
      deleteCookie(c, cookie, { path: "/", secure });
    },
  };
}
