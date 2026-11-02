import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import { createOrder, getPresence, listOrders, recordPresence } from "@/lib/db";
import {
  type PreparedFile,
  prepareFile,
  removeFiles,
  saveFile,
} from "@/lib/storage";
import {
  MAX_FILES,
  MAX_FILE_MB,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  MAX_TOTAL_MB,
} from "@/lib/types";

const MB = 1024 * 1024;
// Multipart form fields and boundaries add a little on top of the file bytes.
const MAX_BODY = (MAX_TOTAL_MB + 1) * MB;

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const role = await getRole();
  if (!role) return fail("Please log in", 401);
  // Open pages load the orders every 5 seconds, which doubles as their check-in.
  recordPresence(role);
  return NextResponse.json({
    orders: listOrders(role),
    presence: getPresence(role === "shop" ? "customer" : "shop"),
  });
}

export async function POST(req: Request) {
  if ((await getRole()) !== "customer") return fail("Please log in", 401);

  const tooLarge = `Orders can be at most ${MAX_TOTAL_MB} MB in total`;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return fail(tooLarge, 413);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return fail("Could not read the upload");

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);
  const quantity = Number(form.get("quantity"));
  const note = String(form.get("note") ?? "").trim();

  if (uploads.length === 0) return fail("Add at least one file");
  if (uploads.length > MAX_FILES) return fail(`Add at most ${MAX_FILES} files`);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return fail(`Quantity must be between 1 and ${MAX_QUANTITY}`);
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return fail(`Note can be at most ${MAX_NOTE_LENGTH} characters`);
  }
  if (uploads.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL_MB * MB) {
    return fail(tooLarge, 413);
  }

  const prepared: PreparedFile[] = [];
  for (const upload of uploads) {
    if (upload.size > MAX_FILE_MB * MB) {
      return fail(`${upload.name} is larger than ${MAX_FILE_MB} MB`, 413);
    }
    const file = await prepareFile(upload);
    if (!file) {
      return fail(`${upload.name} is not a PDF, JPG, PNG or WebP file`, 415);
    }
    prepared.push(file);
  }

  try {
    await Promise.all(prepared.map(saveFile));
    createOrder(quantity, note, prepared);
  } catch (error) {
    await removeFiles(prepared);
    console.error("Failed to save order", error);
    return fail("Could not save the order. Please try again.", 500);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
