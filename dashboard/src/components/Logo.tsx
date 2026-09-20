/** The shield mark and the header lockup. The mark is generated from the brand sheet (npm run icons in mobile/). */

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return <img src="/logo-mark.png" alt="" className={className} />;
}

/** Mark, product name, and the Hindi name beneath it. `tone` matches the surface it sits on. */
export function Lockup({ tone = "navy", subtitle }: { tone?: "navy" | "white"; subtitle?: string }) {
  const dark = tone === "white";
  return (
    <div className="flex items-center gap-3">
      <LogoMark className="h-10 w-10 shrink-0" />
      <div className="leading-tight">
        <div className={`font-semibold ${dark ? "text-white" : "text-navy"}`}>Suraksha Saathi</div>
        <div className={`text-sm ${dark ? "text-blue-200" : "text-slate-600"}`}>सुरक्षा साथी</div>
        {subtitle ? <div className={`text-xs ${dark ? "text-blue-200" : "text-slate-500"}`}>{subtitle}</div> : null}
      </div>
    </div>
  );
}
