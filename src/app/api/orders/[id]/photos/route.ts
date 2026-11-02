import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import { addPhotos, getOrderCounts } from "@/lib/db";
import {
  type PreparedFile,
  prepareFile,
  removeFiles,
  saveFile,
} from "@/lib/storage";
import { MAX_PHOTOS, MAX_PHOTO_MB } from "@/lib/types";

const MB = 1024 * 1024;

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getRole()) !== "shop") return fail("Please log in", 401);

  const id = Number((await params).id);
  const order = Number.isInteger(id) ? getOrderCounts(id) : undefined;
  if (!order) return fail("Order not found", 404);

  // Multipart form fields and boundaries add a little on top of the file bytes.
  const maxBody = (MAX_PHOTOS * MAX_PHOTO_MB + 1) * MB;
  if (Number(req.headers.get("content-length") ?? 0) > maxBody) {
    return fail(`Photos can be at most ${MAX_PHOTO_MB} MB each`, 413);
  }

  const form = await req.formData().catch(() => null);
  if (!form) return fail("Could not read the upload");

  const uploads = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (uploads.length === 0) return fail("Add at least one photo");
  if (order.photos + uploads.length > MAX_PHOTOS) {
    return fail(`An order can have at most ${MAX_PHOTOS} photos`);
  }

  const prepared: PreparedFile[] = [];
  for (const upload of uploads) {
    if (upload.size > MAX_PHOTO_MB * MB) {
      return fail(`${upload.name} is larger than ${MAX_PHOTO_MB} MB`, 413);
    }
    const file = await prepareFile(upload);
    if (!file || !file.mime.startsWith("image/")) {
      return fail(`${upload.name} is not a JPG, PNG or WebP image`, 415);
    }
    prepared.push(file);
  }

  try {
    await Promise.all(prepared.map(saveFile));
    addPhotos(id, prepared);
  } catch (error) {
    await removeFiles(prepared);
    console.error("Failed to save photos", error);
    return fail("Could not save the photos. Please try again.", 500);
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
