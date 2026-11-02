import type { PDFDocumentLoadingTask } from "pdfjs-dist/legacy/build/pdf.mjs";

const THUMBNAIL_WIDTH = 600;

export type Thumbnail = { src: string; pages: number };

// Kept so that switching tabs or refreshing orders doesn't draw a page again.
const thumbnails = new Map<string, Thumbnail>();
let queue: Promise<unknown> = Promise.resolve();

// Loaded on demand because pdf.js needs a browser.
export async function openPdf(
  url: string,
  options: { firstPageOnly?: boolean } = {},
): Promise<PDFDocumentLoadingTask> {
  const { GlobalWorkerOptions, getDocument } = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );
  GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  return getDocument({
    url,
    // Fetch only the parts of the file that the first page needs.
    disableAutoFetch: options.firstPageOnly,
    disableStream: options.firstPageOnly,
  });
}

async function drawThumbnail(id: string): Promise<Thumbnail> {
  const task = await openPdf(`/api/files/${id}`, { firstPageOnly: true });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    const scale = THUMBNAIL_WIDTH / page.getViewport({ scale: 1 }).width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    return { src: canvas.toDataURL("image/jpeg", 0.8), pages: pdf.numPages };
  } finally {
    await task.destroy();
  }
}

export function cachedThumbnail(id: string) {
  return thumbnails.get(id) ?? null;
}

/** Draws thumbnails one at a time, so a long list of orders doesn't overload a phone. */
export function loadThumbnail(id: string, isWanted: () => boolean) {
  const result = queue.then(async () => {
    const cached = thumbnails.get(id);
    if (cached || !isWanted()) return cached ?? null;
    const thumbnail = await drawThumbnail(id);
    thumbnails.set(id, thumbnail);
    return thumbnail;
  });
  queue = result.catch(() => {});
  return result;
}
