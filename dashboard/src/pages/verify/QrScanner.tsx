import { useEffect, useRef, useState } from "react";

/** Camera QR scan with ZXing, loaded on demand so the page stays light on phones. */
export function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const handler = useRef(onScan);
  handler.current = onScan;

  useEffect(() => {
    let stop: (() => void) | null = null;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't open the camera here. Paste the certificate text instead.");
        return;
      }
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video.current!,
          (result) => {
            if (result && !cancelled) {
              cancelled = true;
              controls.stop();
              handler.current(result.getText());
            }
          },
        );
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch (e) {
        const denied = e instanceof DOMException && e.name === "NotAllowedError";
        setError(denied ? "Camera permission was denied. Allow it in the browser, or paste the certificate text." : "Couldn't start the camera. Paste the certificate text instead.");
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-fail">
          {error}
        </p>
      ) : (
        <div className="relative overflow-hidden rounded-lg bg-black">
          <video ref={video} className="aspect-square w-full object-cover" muted playsInline aria-label="Camera preview" />
          <div className="pointer-events-none absolute inset-[15%] rounded-lg border-4 border-white/80" />
        </div>
      )}
      <button type="button" className="btn-secondary w-full" onClick={onClose}>
        Close camera
      </button>
    </div>
  );
}
