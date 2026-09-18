import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** docs/04 issuance: byte mode, error correction M, with a quiet zone. */
export function QrImage({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL([{ data: new TextEncoder().encode(value), mode: "byte" }], { errorCorrectionLevel: "M", margin: 4, width: size * 2 })
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [value, size]);

  if (failed) return <p className="text-sm text-fail">QR code could not be drawn.</p>;
  if (!src) return <div className="animate-pulse rounded bg-slate-200" style={{ width: size, height: size }} />;
  return <img src={src} alt={label} width={size} height={size} className="rounded border border-slate-200 bg-white" />;
}
