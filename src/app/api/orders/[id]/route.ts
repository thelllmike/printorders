import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import { getOrderCounts, updateOrder } from "@/lib/db";
import { STATUSES, type OrderChanges } from "@/lib/types";

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
