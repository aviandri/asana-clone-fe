// The legacy build: the modern one needs ES2025 (Uint8Array#toHex: Chrome 140, Safari 18.2), which
// leaves recent-but-not-latest browsers with a broken preview.
import { getDocument, GlobalWorkerOptions, type PDFDocumentLoadingTask, type PDFDocumentProxy, type RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';
// Served from our own origin (a build asset), never a CDN.
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from '@/components/Spinner';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';

GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * PDFs render here with pdf.js rather than the browser's viewer: the server sends every file with
 * `CSP: sandbox` (which we don't relax), and a browser's built-in PDF viewer can't be relied on in a
 * sandboxed document.
 * Pages are drawn to a canvas only: no text layer, no annotation layer, no scripting, so nothing in
 * the file can run or link out.
 */
export default function PdfViewer({ url, name }: { url: string; name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [page, setPage] = useState(1);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Destroying the loading task stops its worker and frees the document.
    let task: PDFDocumentLoadingTask | null = null;
    const controller = new AbortController();
    (async () => {
      // The bytes come from our API with the session cookie; pdf.js never fetches anything itself.
      const res = await fetch(url, { credentials: 'include', signal: controller.signal });
      if (!res.ok) throw new Error(String(res.status));
      const data = new Uint8Array(await res.arrayBuffer());
      const params = {
        data,
        // 6.x has no eval path any more (the option is gone); kept so an upgrade that brings one
        // back still runs with it off.
        isEvalSupported: false,
        enableXfa: false,
        stopAtErrors: false,
      };
      if (cancelled) return;
      task = getDocument(params);
      const loaded = await task.promise;
      if (!cancelled) setDoc(loaded);
    })().catch((e: unknown) => {
      if (cancelled || (e instanceof DOMException && e.name === 'AbortError')) return;
      console.warn('PDF preview failed', e);
      setError(true);
    });
    return () => {
      cancelled = true;
      controller.abort();
      void task?.destroy();
    };
  }, [url]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => observer?.disconnect();
  }, []);

  useEffect(() => {
    const target = canvas.current;
    if (!doc || !target || width === 0) return;
    let task: RenderTask | null = null;
    let cancelled = false;
    void doc.getPage(page).then((p) => {
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const scale = Math.max(0.1, (width - 32) / base.width);
      const ratio = window.devicePixelRatio || 1;
      const viewport = p.getViewport({ scale: scale * ratio });
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      target.style.width = `${Math.floor(viewport.width / ratio)}px`;
      target.style.height = `${Math.floor(viewport.height / ratio)}px`;
      task = p.render({ canvas: target, viewport });
      task.promise.catch(() => undefined);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width]);

  const pages = doc?.numPages ?? 0;
  return (
    <div className="flex h-full w-full flex-col">
      <div ref={box} className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <p className="text-center text-sm text-gray-600">Couldn’t open this PDF. Download it instead.</p>
        ) : !doc ? (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <canvas ref={canvas} role="img" aria-label={`${name}, page ${page} of ${pages}`} className="mx-auto bg-white shadow" />
        )}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 border-t border-gray-200 bg-white py-2 text-xs text-gray-600">
          <button type="button" className="btn-ghost p-1" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
            <ChevronLeftIcon />
          </button>
          <span aria-live="polite">
            Page {page} of {pages}
          </span>
          <button type="button" className="btn-ghost p-1" aria-label="Next page" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>
            <ChevronRightIcon />
          </button>
        </div>
      )}
    </div>
  );
}
