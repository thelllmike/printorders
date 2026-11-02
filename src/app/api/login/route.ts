import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSession,
  roleForPassword,
} from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const role = roleForPassword(password);

  if (!role) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const res = NextResponse.json({ redirect: role === "shop" ? "/shop" : "/" });
  res.cookies.set(SESSION_COOKIE, createSession(role), {
    httpOnly: true,
    sameSite: "lax",
    // nginx sets this header, so the cookie is HTTPS-only once SSL is on.
    secure: req.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}
