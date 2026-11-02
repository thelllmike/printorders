import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import { setOrderStatus } from "@/lib/db";
import { STATUSES, type Status } from "@/lib/types";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getRole()) !== "shop") {
    return NextResponse.json({ error: "Please log in" }, { status: 401 });
  }

  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  if (!Number.isInteger(id) || !STATUSES.includes(body?.status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  if (!setOrderStatus(id, body.status as Status)) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
