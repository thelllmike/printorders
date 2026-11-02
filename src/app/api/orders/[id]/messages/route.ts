import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import { addMessage, getOrderCounts, listMessages, markMessagesRead } from "@/lib/db";
import { MAX_MESSAGE_LENGTH } from "@/lib/types";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function findOrder(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  return Number.isInteger(id) && getOrderCounts(id) ? id : null;
}

// Opening a chat is what marks its messages as read.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = await getRole();
  if (!role) return fail("Please log in", 401);

  const id = await findOrder(params);
  if (id === null) return fail("Order not found", 404);

  const messages = listMessages(id);
  const last = messages.at(-1);
  if (last) markMessagesRead(id, role, last.id);
  return NextResponse.json({ messages });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const role = await getRole();
  if (!role) return fail("Please log in", 401);

  const id = await findOrder(params);
  if (id === null) return fail("Order not found", 404);

  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return fail("Write a message first");
  if (text.length > MAX_MESSAGE_LENGTH) {
    return fail(`Messages can be at most ${MAX_MESSAGE_LENGTH} characters`);
  }

  // The sender comes from the login, never from the request.
  addMessage(id, role, text);
  return NextResponse.json({ ok: true }, { status: 201 });
}
