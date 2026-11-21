import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, Flashlight, ImageUp, QrCode, RefreshCw, SwitchCamera, X } from 'lucide-react';

interface QrScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScan: (rawValue: string) => Promise<void>;
}

interface BarcodeDetectorLike {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export function QrScannerModal({ open, onClose, onScan }: QrScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: '', at: 0 });
  const isResolvingRef = useRef(false);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraState, setCameraState] = useState<'INITIALIZING' | 'ACTIVE' | 'ERROR' | 'UNSUPPORTED'>('INITIALIZING');
  const [cameraError, setCameraError] = useState<string>('');
  const [scanError, setScanError] = useState<string>('');
  const [lastScanned, setLastScanned] = useState<string>('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [isLookingUp, setIsLookingUp] = useState(false);

  const stopStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleDecodedValue = useCallback(async (rawValue: string) => {
    const trimmed = rawValue.trim();
    if (!trimmed || isResolvingRef.current) return;

    const now = Date.now();
    if (lastScanRef.current.value === trimmed && now - lastScanRef.current.at < 2500) {
      return;
    }
    lastScanRef.current = { value: trimmed, at: now };
    setLastScanned(trimmed);
    setScanError('');
    setIsLookingUp(true);
    isResolvingRef.current = true;

    try {
      await onScanRef.current(trimmed);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Member not found for scanned pass.';
      setScanError(msg);
    } finally {
      isResolvingRef.current = false;
      setIsLookingUp(false);
    }
  }, []);

  const startCamera = useCallback(
    async (deviceIdOverride?: string) => {
      stopStream();
      setScanError('');
      setCameraError('');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraState('UNSUPPORTED');
        setCameraError('Camera API is unavailable in this browser context. Upload a QR image or enter a pass code below.');
        return;
      }

      setCameraState('INITIALIZING');
      try {
        const videoConstraints: MediaTrackConstraints = deviceIdOverride
          ? { deviceId: { exact: deviceIdOverride }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } };

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false,
        });

        streamRef.current = stream;

        const videoEl = videoRef.current;
        if (!videoEl) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        videoEl.srcObject = stream;
        await videoEl.play();

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps.torch));
        }

        // Refresh enumerated cameras now that permission is granted
        if (navigator.mediaDevices.enumerateDevices) {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
          setDevices(videoInputs);
          const activeDeviceId = track?.getSettings().deviceId;
          if (!deviceIdOverride && activeDeviceId) {
            setSelectedDeviceId(activeDeviceId);
          }
        }

        setCameraState('ACTIVE');

        // Use native BarcodeDetector if available, paired with universal jsQR fallback
        let detector: BarcodeDetectorLike | null = null;
        if (window.BarcodeDetector) {
          try {
            detector = new window.BarcodeDetector({ formats: ['qr_code'] });
          } catch {
            detector = null;
          }
        }

        let lastSampleTime = 0;
        const scanLoop = async (ts: number) => {
          if (!streamRef.current || !videoRef.current || !canvasRef.current) return;

          if (ts - lastSampleTime >= 140 && !isResolvingRef.current) {
            lastSampleTime = ts;
            const v = videoRef.current;
            if (v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && v.videoWidth > 0 && v.videoHeight > 0) {
              const canvas = canvasRef.current;
              const targetW = Math.min(v.videoWidth, 720);
              const scale = targetW / v.videoWidth;
              const targetH = Math.round(v.videoHeight * scale);
              if (canvas.width !== targetW || canvas.height !== targetH) {
                canvas.width = targetW;
                canvas.height = targetH;
              }
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(v, 0, 0, targetW, targetH);

                let decoded: string | null = null;
                if (detector) {
                  try {
                    const results = await detector.detect(canvas);
                    if (results.length > 0 && results[0].rawValue) {
                      decoded = results[0].rawValue;
                    }
                  } catch {
                    detector = null;
                  }
                }

                if (!decoded) {
                  const imgData = ctx.getImageData(0, 0, targetW, targetH);
                  const qr = jsQR(imgData.data, targetW, targetH, { inversionAttempts: 'attemptBoth' });
                  if (qr?.data) {
                    decoded = qr.data;
                  }
                }

                if (decoded) {
                  void handleDecodedValue(decoded);
                }
              }
            }
          }

          rafRef.current = requestAnimationFrame(scanLoop);
        };

        rafRef.current = requestAnimationFrame(scanLoop);
      } catch (err) {
        stopStream();
        setCameraState('ERROR');
        if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
          setCameraError('Camera access was denied. Allow camera access in your browser settings or use the upload / manual pass lookup below.');
        } else if (err instanceof DOMException && err.name === 'NotFoundError') {
          setCameraError('No camera device detected on this terminal. Upload a pass image or enter the member code below.');
        } else {
          setCameraError(err instanceof Error ? err.message : 'Unable to start camera stream.');
        }
      }
    },
    [handleDecodedValue, stopStream]
  );

  useEffect(() => {
    if (!open) {
      stopStream();
      setScanError('');
      setLastScanned('');
      return;
    }
    void startCamera(selectedDeviceId || undefined);
    return () => {
      stopStream();
    };
  }, [open, selectedDeviceId, startCamera, stopStream]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setScanError('Flashlight control is not supported on this device.');
    }
  };

  const handleCycleCamera = () => {
    if (devices.length < 2) return;
    const currentIdx = devices.findIndex((d) => d.deviceId === selectedDeviceId);
    const nextDevice = devices[(currentIdx + 1) % devices.length];
    if (nextDevice) {
      setSelectedDeviceId(nextDevice.deviceId);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setScanError('');
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, img.width, img.height);
        const qr = jsQR(imgData.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
        if (qr?.data) {
          void handleDecodedValue(qr.data);
        } else {
          setScanError('No valid QR code found in the selected image.');
        }
      };
      img.src = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsDataURL(file);
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    lastScanRef.current = { value: '', at: 0 };
    await handleDecodedValue(manualInput.trim());
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="qr-scanner-title"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <QrCode className="w-5 h-5 text-lime-500" />
            <div>
              <h2 id="qr-scanner-title" className="font-display text-base font-bold">
                Scan Digital Membership Pass
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Hold member QR code inside the frame for instant profile lookup
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close scanner"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Camera Viewport */}
          <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraState === 'ACTIVE' ? 'opacity-100' : 'opacity-0'}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Targeting Frame Overlay */}
            {cameraState === 'ACTIVE' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-52 h-52 relative">
                  <span className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 border-lime-400 rounded-tl-lg" />
                  <span className="absolute top-0 right-0 w-7 h-7 border-t-2 border-r-2 border-lime-400 rounded-tr-lg" />
                  <span className="absolute bottom-0 left-0 w-7 h-7 border-b-2 border-l-2 border-lime-400 rounded-bl-lg" />
                  <span className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 border-lime-400 rounded-br-lg" />
                </div>
              </div>
            )}

            {/* Initializing / Error Overlay */}
            {cameraState !== 'ACTIVE' && (
              <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center gap-3">
                <Camera className="w-9 h-9 text-slate-500" />
                {cameraState === 'INITIALIZING' ? (
                  <p className="text-xs text-slate-300">Starting camera...</p>
                ) : (
                  <>
                    <p className="text-xs text-slate-300 max-w-xs leading-relaxed">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => void startCamera(selectedDeviceId || undefined)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-lime-400 text-slate-950 text-xs font-semibold hover:bg-lime-300"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Retry Camera
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Camera Controls Strip */}
            {cameraState === 'ACTIVE' && (
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                <div className="px-2.5 py-1 rounded-md bg-slate-950/75 text-[11px] font-mono text-slate-200">
                  {isLookingUp ? 'Looking up member...' : lastScanned ? `Read: ${lastScanned}` : 'Scanning live frames'}
                </div>
                <div className="flex items-center gap-1.5">
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      aria-label="Toggle flashlight"
                      className={`p-2 rounded-lg backdrop-blur-sm border text-xs ${
                        torchOn
                          ? 'bg-lime-400 text-slate-950 border-lime-400'
                          : 'bg-slate-950/75 text-white border-white/15 hover:bg-slate-900'
                      }`}
                    >
                      <Flashlight className="w-4 h-4" />
                    </button>
                  )}
                  {devices.length > 1 && (
                    <button
                      type="button"
                      onClick={handleCycleCamera}
                      aria-label="Switch camera"
                      className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-slate-950/75 text-white border border-white/15 text-xs hover:bg-slate-900"
                    >
                      <SwitchCamera className="w-4 h-4" />
                      Switch
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Scan Lookup Error Banner */}
          {scanError && (
            <div className="px-3.5 py-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-medium">
              {scanError}
            </div>
          )}

          {/* Camera selector when multiple cameras exist */}
          {devices.length > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="camera-select" className="text-slate-500 shrink-0">
                Camera:
              </label>
              <select
                id="camera-select"
                value={selectedDeviceId}
                onChange={(e) => setSelectedDeviceId(e.target.value)}
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs"
              >
                {devices.map((d, idx) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Secondary Fallback Controls: Upload QR Image + Manual Pass Entry */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-500">No webcam or printed pass?</span>
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold hover:border-lime-400">
                <ImageUp className="w-3.5 h-3.5 text-lime-500" />
                Upload QR Image
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>
            </div>

            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                placeholder="Or enter QR token / Member ID (e.g. CC-00001)"
                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent text-xs font-mono"
              />
              <button
                type="submit"
                disabled={isLookingUp || !manualInput.trim()}
                className="px-3.5 py-2 rounded-lg bg-slate-900 text-white dark:bg-lime-400 dark:text-slate-950 text-xs font-semibold disabled:opacity-40"
              >
                Lookup
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
