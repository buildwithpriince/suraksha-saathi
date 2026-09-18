const dateFormat = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatDate = (unix: number | null | undefined) => (unix ? dateFormat.format(unix * 1000) : "—");
export const formatDateTime = (unix: number | null | undefined) =>
  unix ? dateTimeFormat.format(unix * 1000) : "—";

export function formatRelative(unix: number, now = Date.now() / 1000): string {
  const diff = unix - now;
  const abs = Math.abs(diff);
  if (abs < 60) return relative.format(Math.round(diff), "second");
  if (abs < 3600) return relative.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return relative.format(Math.round(diff / 3600), "hour");
  return relative.format(Math.round(diff / 86400), "day");
}

export const SCENARIO_NAMES: Record<string, string> = {
  FIRE_01: "Fire & Explosion",
  GAS_01: "Gas Leak & Confined Space",
};

export const scenarioName = (id: string) => SCENARIO_NAMES[id] ?? id;

export const modeName = (mode: string) => (mode === "ar" ? "AR" : mode === "tabletop" ? "Tabletop" : mode);

/** docs/06 CSV injection rule, for exports the dashboard builds itself. */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
