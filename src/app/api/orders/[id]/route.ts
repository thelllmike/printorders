import { after, NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import {
  deleteOrder,
  editOrder,
  getOrderCounts,
  getOrderDetails,
  getOrderFiles,
  updateOrder,
} from "@/lib/db";
import { notifyNewDesign } from "@/lib/sms";
import { prepareOrderFiles, removeFiles, saveFile } from "@/lib/storage";
import {
  MAX_FILES,
  MAX_FILE_MB,
  MAX_NOTE_LENGTH,
  MAX_QUANTITY,
  MAX_TOTAL_MB,
  STATUSES,
  type OrderChanges,
} from "@/lib/types";

const MB = 1024 * 1024;
const LOCKED = "The shop has started on this order, so it can no longer be deleted";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

// The customer can change an order at any stage: its details, and which files it has.
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getRole()) !== "customer") return fail("Please log in", 401);

  const id = Number((await params).id);
  const order = Number.isInteger(id) ? getOrderDetails(id) : undefined;
  if (!order) return fail("Order not found", 404);

  if (Number(req.headers.get("content-length") ?? 0) > (MAX_TOTAL_MB + 1) * MB) {
    return fail(`Orders can be at most ${MAX_TOTAL_MB} MB in total`, 413);
  }
  const form = await req.formData().catch(() => null);
  if (!form) return fail("Could not read the changes");

  const quantity = Number(form.get("quantity"));
  const note = String(form.get("note") ?? "").trim();
  const deadline = String(form.get("deadline") ?? "");
  const deadlineTime = Date.parse(deadline);
  const removeIds = form.getAll("removeFiles").map(String);
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    return fail(`Quantity must be between 1 and ${MAX_QUANTITY}`);
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return fail(`Note can be at most ${MAX_NOTE_LENGTH} characters`);
  }
  // An unchanged deadline may already have passed; a new one has to be in the future.
  const deadlineChanged =
    deadline !== "" && (order.deadline === null || Date.parse(order.deadline) !== deadlineTime);
  if (deadline && (Number.isNaN(deadlineTime) || (deadlineChanged && deadlineTime <= Date.now()))) {
    return fail("Deadline must be in the future");
  }

  const kept = getOrderFiles(id).filter((f) => !removeIds.includes(f.id));
  if (kept.length + uploads.length === 0) return fail("An order needs at least one file");
  if (kept.length + uploads.length > MAX_FILES) return fail(`Add at most ${MAX_FILES} files`);
  const totalSize = [...kept, ...uploads].reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_MB * MB) {
    return fail(`Orders can be at most ${MAX_TOTAL_MB} MB in total`, 413);
  }

  const prepared = await prepareOrderFiles(uploads, MAX_FILE_MB);
  if ("error" in prepared) return fail(prepared.error, prepared.status);

  const removed = getOrderFiles(id).filter((f) => removeIds.includes(f.id));
  try {
    await Promise.all(prepared.map(saveFile));
    const saved = editOrder(
      id,
      quantity,
      note,
      deadline ? new Date(deadlineTime).toISOString() : null,
      removed.map((f) => f.id),
      prepared,
    );
    if (!saved) {
      await removeFiles(prepared);
      return fail("Order not found", 404);
    }
  } catch (error) {
    await removeFiles(prepared);
    console.error("Failed to edit order", error);
    return fail("Could not save the changes. Please try again.", 500);
  }

  await removeFiles(removed.map((f) => ({ storedName: f.stored_name })));
  if (prepared.length > 0) after(() => notifyNewDesign(id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getRole()) !== "customer") return fail("Please log in", 401);

  const id = Number((await params).id);
  if (!Number.isInteger(id) || !getOrderDetails(id)) return fail("Order not found", 404);

  const files = deleteOrder(id);
  if (!files) return fail(LOCKED, 409);
  await removeFiles(files);
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getRole()) !== "shop") {
    return NextResponse.json({ error: "Please log in" }, { status: 401 });
  }

  const id = Number((await params).id);
  const body = await req.json().catch(() => null);
  const { status, paid, printedCopies } = (body ?? {}) as OrderChanges;

  if (
    !Number.isInteger(id) ||
    (status === undefined && paid === undefined && printedCopies === undefined) ||
    (status !== undefined && !STATUSES.includes(status)) ||
    (paid !== undefined && typeof paid !== "boolean")
  ) {
    return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  }

  const order = getOrderCounts(id);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (printedCopies !== undefined && (status ?? order.status) === "pending") {
    return NextResponse.json(
      { error: "Set the order to Ongoing before adding copies printed" },
      { status: 400 },
    );
  }
  if (
    printedCopies !== undefined &&
    (!Number.isInteger(printedCopies) || printedCopies < 0 || printedCopies > order.quantity)
  ) {
    return NextResponse.json(
      { error: `Copies printed must be between 0 and ${order.quantity}` },
      { status: 400 },
    );
  }

  updateOrder(id, { status, paid, printedCopies });
  return NextResponse.json({ ok: true });
}
