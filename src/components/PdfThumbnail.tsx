"use client";

import { useEffect, useRef, useState } from "react";
import { cachedThumbnail, loadThumbnail } from "./pdf";

export function PdfThumbnail({ id }: { id: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [thumbnail, setThumbnail] = useState(() => cachedThumbnail(id));

  useEffect(() => {
    if (thumbnail || !box.current) return;
    let mounted = true;

    // Only PDFs near the screen are drawn, so unseen orders download nothing.
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        loadThumbnail(id, () => mounted)
          .then((result) => {
            if (mounted && result) setThumbnail(result);
          })
          .catch(() => {}); // The PDF label stays, and the full preview shows the reason.
      },
      { rootMargin: "300px" },
    );
    observer.observe(box.current);

    return () => {
      mounted = false;
      observer.disconnect();
    };
  }, [id, thumbnail]);

  if (!thumbnail) {
    return <span ref={box} className="pdf-tag">PDF</span>;
  }

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={thumbnail.src} alt="" />
      {thumbnail.pages > 1 && <span className="page-count">{thumbnail.pages} pages</span>}
    </>
  );
}
