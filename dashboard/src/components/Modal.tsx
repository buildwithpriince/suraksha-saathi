import { useEffect, useId, useRef, type ReactNode } from "react";

/** Minimal accessible modal: labelled, Escape closes, focus moves in and returns on close. */
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>("textarea, input, select, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 id={titleId} className="mb-3 text-lg font-semibold text-navy">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
