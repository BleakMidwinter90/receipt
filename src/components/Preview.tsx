import { useEffect, useRef, useState } from 'react';

import { loadFonts } from '../lib/fonts';
import { renderInvoice, type InvoiceDocument } from '../lib/render';

/**
 * The preview is the real PDF.
 *
 * The obvious alternative is an HTML mock-up styled to resemble the output, and
 * it is a trap: the two drift, and the first anyone knows is when a client
 * receives something that does not match what was on screen. Rendering the
 * actual file means the preview cannot be wrong about the document — if the
 * naira sign is missing or a row splits across a page, it is visible here.
 *
 * The cost is a render per change, so it is debounced and the previous object
 * URL is revoked; each one pins a whole PDF in memory until it is.
 */

export function Preview({
  invoice,
  logo,
}: {
  invoice: InvoiceDocument;
  logo: { bytes: ArrayBuffer; type: string } | null;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previous = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const fonts = await loadFonts();
        const blob = await renderInvoice(invoice, fonts, logo);
        if (cancelled) return;

        const next = URL.createObjectURL(blob);
        // Revoke only after the new one exists, so the frame never blanks.
        if (previous.current) URL.revokeObjectURL(previous.current);
        previous.current = next;

        setUrl(next);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : 'The preview could not be drawn.');
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [invoice, logo]);

  useEffect(() => {
    return () => {
      if (previous.current) URL.revokeObjectURL(previous.current);
    };
  }, []);

  return (
    <div className="panel sticky top-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="text-sm font-semibold">Preview</h2>
        <span className="text-xs text-ink-faint">This is the file itself</span>
      </div>

      {error ? (
        <p className="p-5 text-sm text-warn">{error}</p>
      ) : url ? (
        <iframe
          src={`${url}#toolbar=0&navpanes=0`}
          title="Invoice preview"
          className="h-[70vh] w-full bg-raised"
        />
      ) : (
        <div className="flex h-[70vh] items-center justify-center bg-raised">
          <p className="text-sm text-ink-faint">Drawing…</p>
        </div>
      )}
    </div>
  );
}
