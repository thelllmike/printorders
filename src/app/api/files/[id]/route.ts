import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import { UPLOAD_DIR, deleteFile, getFile } from "@/lib/db";
import { removeFiles } from "@/lib/storage";

// Returns the requested part of the file, or "invalid" if it starts past the end.
function parseRange(header: string | null, size: number) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(header ?? "");
  if (!match) return null;
  const start = Number(match[1]);
  const end = Math.min(match[2] ? Number(match[2]) : size - 1, size - 1);
  return start < size && start <= end ? { start, end } : "invalid";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await getRole())) {
    return NextResponse.json({ error: "Please log in" }, { status: 401 });
  }

  const file = getFile((await params).id);
  const filePath = file && path.join(UPLOAD_DIR, file.stored_name);
  const stat = filePath && (await fs.stat(filePath).catch(() => null));
  if (!file || !filePath || !stat) {
    return NextResponse.json({ error: "File not found" }, { status: 404 });
  }

  const range = parseRange(req.headers.get("range"), stat.size);
  if (range === "invalid") {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${stat.size}` },
    });
  }

  const download = new URL(req.url).searchParams.has("download");
  const stream = Readable.toWeb(createReadStream(filePath, range ?? {})) as ReadableStream;
  return new Response(stream, {
    status: range ? 206 : 200,
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(range ? range.end - range.start + 1 : stat.size),
      "Accept-Ranges": "bytes",
      ...(range && { "Content-Range": `bytes ${range.start}-${range.end}/${stat.size}` }),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

// Only finished-work photos can be removed. Customers' files stay with the order.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if ((await getRole()) !== "shop") {
    return NextResponse.json({ error: "Please log in" }, { status: 401 });
  }

  const file = getFile((await params).id);
  if (!file || file.kind !== "finished") {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  deleteFile(file.id);
  await removeFiles([{ storedName: file.stored_name }]);
  return NextResponse.json({ ok: true });
}
