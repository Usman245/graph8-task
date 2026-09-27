"use client";

import { useEffect, useId, useRef } from "react";

/** Side panel dialog: Escape closes, focus moves in and returns to the opener. */
export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="pg-fade absolute inset-0 bg-foreground/30 backdrop-blur-[2px]" aria-hidden="true" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="pg-slide-in relative m-0 flex h-full w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-[0_24px_80px_-20px_rgba(28,29,31,.45)] outline-none sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-2xl sm:border sm:border-border"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border bg-background/60 px-6 py-5">
          <h2 id={titleId} className="min-w-0 text-lg font-semibold leading-snug tracking-tight">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="-mr-1 inline-flex h-8 w-8 flex-none items-center justify-center rounded-lg text-muted transition hover:bg-surface-muted hover:text-foreground"
            aria-label="Close"
          >
            <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m4 4 8 8M12 4l-8 8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-border bg-background/60 px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
