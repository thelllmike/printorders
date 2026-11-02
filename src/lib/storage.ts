import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UPLOAD_DIR } from "./db";
import type { OrderFile } from "./types";

// The type comes from the file's contents, not from its name or browser-sent type.
function detectType(b: Buffer): { mime: string; ext: string } | null {
  if (b.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { mime: "application/pdf", ext: ".pdf" };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    return { mime: "image/jpeg", ext: ".jpg" };
  }
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: ".png" };
  }
  if (
    b.subarray(0, 4).toString("latin1") === "RIFF" &&
    b.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return { mime: "image/webp", ext: ".webp" };
  }
  return null;
}

export type PreparedFile = OrderFile & { storedName: string; data: Buffer };

/** Returns the file ready to save, or null if its type isn't allowed. */
export async function prepareFile(file: File): Promise<PreparedFile | null> {
  const data = Buffer.from(await file.arrayBuffer());
  const type = detectType(data);
  if (!type) return null;
  const id = randomUUID();
  return {
    id,
    name: path.basename(file.name.replaceAll("\\", "/")).slice(0, 200) || "file",
    mime: type.mime,
    size: data.length,
    storedName: id + type.ext,
    data,
  };
}

export async function saveFile(file: PreparedFile) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, file.storedName), file.data, { flag: "wx" });
}

export async function removeFiles(files: PreparedFile[]) {
  await Promise.all(
    files.map((f) => fs.rm(path.join(UPLOAD_DIR, f.storedName), { force: true })),
  );
}
