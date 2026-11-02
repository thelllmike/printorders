import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export type Role = "customer" | "shop";

export const SESSION_COOKIE = "print_session";
export const SESSION_DAYS = 30;

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return value;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(a), hash(b));
}

export function roleForPassword(password: string): Role | null {
  const shop = process.env.SHOP_PASSWORD;
  const customer = process.env.CUSTOMER_PASSWORD;
  if (shop && safeEqual(password, shop)) return "shop";
  if (customer && safeEqual(password, customer)) return "customer";
  return null;
}

export function createSession(role: Role) {
  const expires = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${role}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

export async function getRole(): Promise<Role | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [role, expires, signature] = token.split(".");
  if (role !== "customer" && role !== "shop") return null;
  if (!signature || !safeEqual(signature, sign(`${role}.${expires}`))) return null;
  if (Number(expires) < Date.now()) return null;
  return role;
}
