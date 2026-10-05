'use client';

import { HelpCircle } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'end';
  iconSize?: number;
  className?: string;
}

export default function InfoTooltip({
  text,
  side = 'bottom',
  align = 'start',
  iconSize = 14,
  className = '',
}: InfoTooltipProps) {
  const bubblePos =
    (side === 'bottom' ? 'top-full mt-1.5 ' : 'bottom-full mb-1.5 ') +
    (align === 'start' ? 'left-0' : 'right-0');

  return (
    <span className={`relative inline-flex items-center group ${className}`}>
      <button
        type="button"
        aria-label="More info"
        tabIndex={0}
        className="inline-flex cursor-help items-center justify-center rounded-full text-[var(--muted)] outline-none transition-colors hover:text-[var(--foreground)] focus-visible:text-[var(--foreground)]"
      >
        <HelpCircle style={{ width: iconSize, height: iconSize }} />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute ${bubblePos} z-50 w-60 rounded-md border border-[var(--card-border)] bg-[var(--card-bg)] p-2.5 text-[11px] font-normal leading-snug text-[var(--foreground)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100`}
        style={{ textTransform: 'none', letterSpacing: 'normal' }}
      >
        {text}
      </span>
    </span>
  );
}
