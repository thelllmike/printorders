"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { OrderFile } from "@/lib/types";
import { openPdf } from "./pdf";

const RENDER_WIDTH = 900;

// Pages are drawn with pdf.js because phone browsers often can't show a PDF in the page.
function PdfPages({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let closed = false;
    let destroy = () => {};

    (async () => {
      const task = await openPdf(url);
      destroy = () => void task.destroy();
      if (closed) return destroy();
      setPdf(await task.promise);
    })().catch(() => {
      if (!closed) setFailed(true);
    });

    return () => {
      closed = true;
      destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf) return;
    let closed = false;
    let task: RenderTask | undefined;

    (async () => {
      const pdfPage = await pdf.getPage(page);
      const target = canvas.current;
      if (closed || !target) return;

      const width = pdfPage.getViewport({ scale: 1 }).width;
      const scale = (RENDER_WIDTH / width) * Math.min(window.devicePixelRatio, 2);
      const viewport = pdfPage.getViewport({ scale });
      target.width = viewport.width;
      target.height = viewport.height;
      task = pdfPage.render({ canvas: target, viewport });
      await task.promise;
    })().catch((error) => {
      if (!closed && error?.name !== "RenderingCancelledException") setFailed(true);
    });

    return () => {
      closed = true;
      task?.cancel();
    };
  }, [pdf, page]);

  if (failed) {
    return (
      <p className="preview-message">
        This PDF can&apos;t be previewed. It may be password protected. Use Download to open it.
      </p>
    );
  }

  return (
    <>
      {!pdf && <p className="preview-message">Loading preview…</p>}
      <canvas ref={canvas} className="preview-page" hidden={!pdf} />
      {pdf && (
        <div className="preview-nav">
          <button disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span aria-live="polite">Page {page} of {pdf.numPages}</span>
          <button disabled={page === pdf.numPages} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}

export function FilePreview({ file, onClose }: { file: OrderFile; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const url = `/api/files/${file.id}`;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="preview"
      aria-label={`Preview of ${file.name}`}
      onClose={onClose}
    >
      <div className="preview-bar">
        <strong>{file.name}</strong>
        <a className="link" href={`${url}?download`}>Download</a>
        <button className="link" onClick={() => dialog.current?.close()}>Close</button>
      </div>
      <div className="preview-body">
        {file.mime === "application/pdf" ? (
          <PdfPages url={url} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="preview-page" src={url} alt={file.name} />
        )}
      </div>
    </dialog>
  );
}
