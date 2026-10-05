'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2, AlertCircle } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface PdfHighlight {
  text: string;
  criterionName: string;
}

interface PdfViewerProps {
  url: string | null;
  highlights?: PdfHighlight[];
}

const HIGHLIGHT_COLORS: Record<string, { bg: string; border: string }> = {};
const COLOR_PALETTE = [
  { bg: 'rgba(99,102,241,0.22)', border: '#6366F1' },
  { bg: 'rgba(16,185,129,0.22)', border: '#10B981' },
  { bg: 'rgba(245,158,11,0.22)', border: '#F59E0B' },
  { bg: 'rgba(239,68,68,0.22)', border: '#EF4444' },
  { bg: 'rgba(139,92,246,0.22)', border: '#8B5CF6' },
  { bg: 'rgba(6,182,212,0.22)', border: '#06B6D4' },
];

function getColorForCriterion(name: string): { bg: string; border: string } {
  if (!HIGHLIGHT_COLORS[name]) {
    const idx = Object.keys(HIGHLIGHT_COLORS).length % COLOR_PALETTE.length;
    HIGHLIGHT_COLORS[name] = COLOR_PALETTE[idx];
  }
  return HIGHLIGHT_COLORS[name];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function PdfViewer({ url, highlights = [] }: PdfViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  // Page-level highlight map: itemIndex -> criterionName
  const highlightMapRef = useRef<Map<number, string>>(new Map());
  const [hlMapVersion, setHlMapVersion] = useState(0);
  const lastComputedRef = useRef<string>('');

  const onDocumentLoadSuccess = ({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setPageNumber(1);
    setLoading(false);
    setError(false);
  };

  const onDocumentLoadError = () => {
    setLoading(false);
    setError(true);
  };

  const goToPrevPage = () => setPageNumber((prev) => Math.max(1, prev - 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(numPages, prev + 1));
  const zoomIn = () => setScale((prev) => Math.min(2.5, prev + 0.15));
  const zoomOut = () => setScale((prev) => Math.max(0.5, prev - 0.15));

  // Stable fingerprint to detect highlight content changes
  const highlightsKey = useMemo(
    () => highlights.map(h => h.text.slice(0, 20)).join('|'),
    [highlights],
  );

  /**
   * Page-level text matching: concatenate ALL text items into one string,
   * find each highlight quote via regex, then map matched character ranges
   * back to item indices. Works regardless of how the PDF chunks text.
   */
  const handleGetTextSuccess = useCallback(
    (textContent: { items: Array<Record<string, unknown>> }) => {
      const cacheKey = `${pageNumber}::${highlightsKey}`;
      if (lastComputedRef.current === cacheKey) return;
      lastComputedRef.current = cacheKey;

      if (!highlights.length) {
        highlightMapRef.current = new Map();
        return;
      }

      const items: string[] = textContent.items
        .filter((item) => typeof item.str === 'string')
        .map((item) => item.str as string);

      if (items.length === 0) {
        highlightMapRef.current = new Map();
        return;
      }

      const map = new Map<number, string>();

      // Build full page text, tracking each item's character range
      let fullText = '';
      const itemRanges: { start: number; end: number }[] = [];
      for (let i = 0; i < items.length; i++) {
        const start = fullText.length;
        fullText += items[i];
        itemRanges.push({ start, end: fullText.length });
        fullText += ' ';
      }

      for (const hl of highlights) {
        const words = hl.text.trim().split(/\s+/).filter((w) => w.length > 0);
        if (words.length < 3) continue;

        // Try full match first, then fall back to a shorter prefix if the quote is long
        const attempts: string[][] = [words];
        if (words.length > 12) {
          // For long quotes, also try just the first 10 words as a fallback
          attempts.push(words.slice(0, 10));
        }

        let matched = false;
        for (const attempt of attempts) {
          if (matched) break;
          // Regex: each word with flexible whitespace/punctuation between
          const pattern = attempt.map((w) => escapeRegExp(w)).join('[\\s\\S]{0,20}');
          try {
            const regex = new RegExp(pattern, 'gi');
            let match;
            while ((match = regex.exec(fullText)) !== null) {
              matched = true;
              const matchStart = match.index;
              const matchEnd = matchStart + match[0].length;

              // Mark every text item overlapping this range
              for (let i = 0; i < itemRanges.length; i++) {
                const r = itemRanges[i];
                if (r.end > matchStart && r.start < matchEnd && items[i].trim().length > 0) {
                  if (!map.has(i)) {
                    map.set(i, hl.criterionName);
                  }
                }
              }

              regex.lastIndex = matchEnd;
              if (match[0].length === 0) break;
            }
          } catch {
            // Regex too complex, skip
          }
        }
      }

      highlightMapRef.current = map;
      if (map.size > 0) {
        setHlMapVersion((v) => v + 1);
      }
    },
    [pageNumber, highlights, highlightsKey],
  );

  // Uses the precomputed item-index map — no per-item guessing
  const customTextRenderer = useCallback(
    (textItem: { str: string; itemIndex: number }) => {
      const criterionName = highlightMapRef.current.get(textItem.itemIndex);
      if (criterionName) {
        const color = getColorForCriterion(criterionName);
        return `<mark class="pdf-hl" style="background:${color.bg};--hl-color:${color.border};" data-criteria="${criterionName}">${textItem.str}</mark>`;
      }
      return textItem.str;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hlMapVersion],
  );

  if (!url) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-8 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="text-sm text-gray-400 dark:text-slate-500">No PDF loaded</p>
      </div>
    );
  }

  // Build legend from unique criteria
  const legendItems = useMemo(() => {
    const seen = new Set<string>();
    return highlights
      .filter((h) => {
        if (seen.has(h.criterionName)) return false;
        seen.add(h.criterionName);
        return true;
      })
      .map((h) => ({ name: h.criterionName, color: getColorForCriterion(h.criterionName) }));
  }, [highlights]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-1">
          <button
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            className="cursor-pointer rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[100px] text-center text-sm text-[#1E1B4B] dark:text-[#E2E8F0]">
            Page {pageNumber} of {numPages}
          </span>
          <button
            onClick={goToNextPage}
            disabled={pageNumber >= numPages}
            className="cursor-pointer rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={zoomOut}
            disabled={scale <= 0.5}
            className="cursor-pointer rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="min-w-[50px] text-center text-sm text-[#1E1B4B] dark:text-[#E2E8F0]">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            disabled={scale >= 2.5}
            className="cursor-pointer rounded-md p-1.5 text-gray-600 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Highlight legend */}
      {legendItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-50/50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800/50">
          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">Evidence:</span>
          {legendItems.map((item) => (
            <span
              key={item.name}
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: item.color.bg,
                color: item.color.border,
                borderBottom: `2px solid ${item.color.border}`,
              }}
            >
              {item.name}
            </span>
          ))}
        </div>
      )}

      {/* PDF Content */}
      <div className="flex-1 overflow-auto bg-gray-100 p-4 dark:bg-slate-800/30">
        {loading && !error && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#6366F1]" />
            <span className="ml-2 text-sm text-gray-500 dark:text-slate-400">Loading PDF...</span>
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <AlertCircle className="h-8 w-8 text-[#EF4444]" />
            <p className="text-sm text-[#EF4444]">Failed to load PDF</p>
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
        >
          {!error && (
            <div className="flex justify-center">
              <Page
                key={`${pageNumber}-hl${highlights.length}-v${hlMapVersion}`}
                pageNumber={pageNumber}
                scale={scale}
                className="shadow-lg"
                loading={null}
                onGetTextSuccess={handleGetTextSuccess}
                customTextRenderer={highlightMapRef.current.size > 0 ? customTextRenderer : undefined}
              />
            </div>
          )}
        </Document>
      </div>
    </div>
  );
}
