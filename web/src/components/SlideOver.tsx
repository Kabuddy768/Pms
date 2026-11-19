"use client";

import { useEffect } from "react";

interface SlideOverProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function SlideOver({ open, onClose, title, subtitle, children }: SlideOverProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="fixed inset-0 bg-[#0F172A]/25"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-xl bg-white border-l border-[#E2E8F0] h-full flex flex-col"
      >
        <div className="px-6 py-4 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-start justify-between gap-4">
          <div>
            {subtitle && (
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#64748B]">
                {subtitle}
              </div>
            )}
            <h2 className="mt-0.5 text-base font-semibold text-[#0F172A]">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-medium border border-[#CBD5E1] bg-white hover:bg-[#F1F5F9] rounded text-[#475569]"
          >
            Close
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
      </aside>
    </div>
  );
}
