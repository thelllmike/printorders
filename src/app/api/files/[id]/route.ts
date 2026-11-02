import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getRole } from "@/lib/auth";
import { UPLOAD_DIR, getFile } from "@/lib/db";

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

  const download = new URL(req.url).searchParams.has("download");
  const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  return new Response(stream, {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(stat.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
