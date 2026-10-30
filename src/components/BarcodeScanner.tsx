import { useEffect, useRef, useState } from 'react';
import { ScanLine } from 'lucide-react';
import { Button, Dialog, Notice } from './ui';

// Uses the browser's built-in BarcodeDetector (Chrome / Edge on Android and desktop) — no extra
// library to download. USB / Bluetooth scanners work everywhere by typing into the search box.
interface DetectorLike { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type DetectorCtor = new (opts?: { formats?: string[] }) => DetectorLike;
const Detector = (globalThis as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;

export const cameraScanSupported = () => !!Detector && !!navigator.mediaDevices?.getUserMedia;

export function BarcodeScannerButton({ onScan, label = 'Scan' }: { onScan: (code: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!cameraScanSupported()) return null;
  return (
    <>
      <Button icon={<ScanLine />} onClick={() => setOpen(true)} aria-label="Scan barcode with camera">{label}</Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Scan barcode" description="Point the camera at the product barcode.">
        {open && <ScannerView onScan={code => { setOpen(false); onScan(code); }} />}
      </Dialog>
    </>
  );
}

function ScannerView({ onScan }: { onScan: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    const detector = new Detector!({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code'] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        const tick = async () => {
          if (stop || !video.current) return;
          try {
            const found = await detector.detect(video.current);
            if (found[0]?.rawValue) { onScan(found[0].rawValue.trim()); return; }
          } catch { /* frame not ready */ }
          window.setTimeout(tick, 180);
        };
        void tick();
      } catch {
        setError('Camera access was blocked. Allow camera access in the browser, or type the barcode.');
      }
    })();
    return () => { stop = true; stream?.getTracks().forEach(t => t.stop()); };
  }, [onScan]);
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-xl bg-black">
        <video ref={video} className="aspect-[4/3] w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" aria-hidden />
      </div>
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}
