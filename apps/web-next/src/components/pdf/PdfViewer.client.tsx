'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';

type Props = {
  fileUrl: string;
  pageNumber: number;
  scale: number;
  token?: string;
  onLoadSuccess?: (numPages: number) => void;
  onOutline?: (outline: any[]) => void;
};

export default function PdfViewerClient({
  fileUrl,
  pageNumber,
  scale,
  token,
  onLoadSuccess,
  onOutline,
}: Props) {
  // ✅ worker (client only)
  useEffect(() => {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
  }, []);

  const file = useMemo(() => ({ url: fileUrl }), [fileUrl]);
  const options = useMemo(() => {
    if (!token) return undefined;
    return { httpHeaders: { Authorization: `Bearer ${token}` } };
  }, [token]);

  const [doc, setDoc] = useState<any>(null);

  return (
    <Document
      file={file}
      options={options}
      loading={<div style={{ padding: 12 }}>Loading PDF…</div>}
      error={<div style={{ padding: 12 }}>Failed to load PDF.</div>}
      onLoadSuccess={async (loaded) => {
        setDoc(loaded);
        onLoadSuccess?.(loaded.numPages);

        if (onOutline) {
          try {
            const o = await loaded.getOutline();
            onOutline(o || []);
          } catch {
            onOutline([]);
          }
        }
      }}
    >
      <Page
        pageNumber={pageNumber}
        scale={scale}
        renderTextLayer
        renderAnnotationLayer
        className="select-text"
      />
    </Document>
  );
}
