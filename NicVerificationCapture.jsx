import React, { useRef, useState, useCallback, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functionsInstance } from './firebase';

/**
 * NicVerificationCapture
 *
 * Step in the post-registration profile flow. Opens the live camera
 * (no file picker — camera-only, matching the selfie step), captures a
 * single frame of the user's NIC, sends it to the extractNicFields
 * Cloud Function for OCR, then shows the parsed fields for the user to
 * confirm or retake before anything is saved.
 *
 * Visual language: a scan/verification moment, not a generic photo
 * upload — dark viewfinder, bracket corners, a moving scan line while
 * processing, monospace readout for the extracted data.
 */

const COLORS = {
  bg: '#10141B',
  panel: '#171D26',
  accent: '#37E6C4', // verification teal — distinct from a "send" green
  accentDim: '#1F7A68',
  warn: '#F2A94E',
  text: '#EAEDF1',
  muted: '#7C8798',
  danger: '#E8607A',
};

export default function NicVerificationCapture({ onVerified, onSkip }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const [phase, setPhase] = useState('camera'); // camera | scanning | review | error
  const [errorMsg, setErrorMsg] = useState('');
  const [fields, setFields] = useState(null); // { nicNumber, fullName, dob, sex, confidence }
  const [edited, setEdited] = useState({ nicNumber: '', fullName: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function openCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (err) {
        setPhase('error');
        setErrorMsg('Camera access is required to verify your NIC. Please allow camera permissions and retry.');
      }
    }

    if (phase === 'camera') openCamera();

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [phase]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    streamRef.current?.getTracks().forEach((t) => t.stop());
    setPhase('scanning');

    const imageBase64 = canvas.toDataURL('image/jpeg', 0.85);

    try {
      const extractNicFields = httpsCallable(functionsInstance, 'extractNicFields');
      const { data } = await extractNicFields({ imageBase64 });
      setFields(data);
      setEdited({ nicNumber: data.nicNumber, fullName: data.fullName || '' });
      setPhase('review');
    } catch (err) {
      setErrorMsg(err.message || 'Could not read the card. Try again with better lighting.');
      setPhase('error');
    }
  }, []);

  const retake = () => {
    setFields(null);
    setErrorMsg('');
    setPhase('camera');
  };

  const confirmAndSave = async () => {
    setSaving(true);
    try {
      const confirmNicVerification = httpsCallable(functionsInstance, 'confirmNicVerification');
      await confirmNicVerification({
        nicNumber: edited.nicNumber.trim(),
        fullName: edited.fullName.trim(),
        dob: fields?.dob || null,
        sex: fields?.sex || null,
      });
      onVerified?.({ ...edited, dob: fields?.dob, sex: fields?.sex });
    } catch (err) {
      setErrorMsg(err.message || 'Could not save verification. Please try again.');
      setPhase('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="w-full max-w-md mx-auto rounded-2xl overflow-hidden"
      style={{ background: COLORS.bg, color: COLORS.text, fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="px-5 pt-5 pb-3">
        <p
          className="text-xs tracking-[0.2em] uppercase"
          style={{ color: COLORS.accent, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
        >
          Identity Check · 1 of 1
        </p>
        <h2 className="text-lg font-semibold mt-1">Verify your NIC</h2>
        <p className="text-sm mt-1" style={{ color: COLORS.muted }}>
          Hold your National Identity Card steady inside the frame. We read the printed
          text only — the photo itself is never stored.
        </p>
      </div>

      {phase === 'camera' && (
        <div className="relative aspect-[4/3] mx-5 rounded-xl overflow-hidden" style={{ background: '#000' }}>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <ViewfinderBrackets color={COLORS.accent} />
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <button
              onClick={capture}
              className="px-6 py-2.5 rounded-full font-medium text-sm"
              style={{ background: COLORS.accent, color: '#06110E' }}
            >
              Capture card
            </button>
          </div>
        </div>
      )}

      {phase === 'scanning' && (
        <div className="relative aspect-[4/3] mx-5 rounded-xl overflow-hidden" style={{ background: '#000' }}>
          <canvas ref={canvasRef} className="w-full h-full object-cover opacity-70" />
          <ViewfinderBrackets color={COLORS.accent} />
          <ScanLine color={COLORS.accent} />
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <span
              className="text-xs tracking-[0.15em] uppercase"
              style={{ color: COLORS.accent, fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}
            >
              Reading card…
            </span>
          </div>
        </div>
      )}

      {phase === 'review' && fields && (
        <div className="px-5 pb-5">
          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.accentDim}` }}
          >
            <p className="text-xs uppercase tracking-wide mb-3" style={{ color: COLORS.muted }}>
              Confirm before saving
            </p>

            <Field
              label="NIC number"
              value={edited.nicNumber}
              onChange={(v) => setEdited((e) => ({ ...e, nicNumber: v }))}
              mono
            />
            <Field
              label="Full name"
              value={edited.fullName}
              onChange={(v) => setEdited((e) => ({ ...e, fullName: v }))}
            />
            {fields.dob && (
              <div className="mt-2 text-sm" style={{ color: COLORS.muted }}>
                Date of birth (derived): <span style={{ color: COLORS.text }}>{fields.dob}</span>
              </div>
            )}

            {fields.confidence !== 'high' && (
              <p className="text-xs mt-3" style={{ color: COLORS.warn }}>
                Some fields were hard to read — double-check them before saving.
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={retake}
              className="flex-1 py-2.5 rounded-full text-sm font-medium"
              style={{ background: 'transparent', border: `1px solid ${COLORS.muted}`, color: COLORS.text }}
            >
              Retake
            </button>
            <button
              onClick={confirmAndSave}
              disabled={saving || !edited.nicNumber || !edited.fullName}
              className="flex-1 py-2.5 rounded-full text-sm font-medium disabled:opacity-50"
              style={{ background: COLORS.accent, color: '#06110E' }}
            >
              {saving ? 'Saving…' : 'Confirm & verify'}
            </button>
          </div>
        </div>
      )}

      {phase === 'error' && (
        <div className="px-5 pb-5">
          <div
            className="rounded-xl p-4 text-sm"
            style={{ background: COLORS.panel, border: `1px solid ${COLORS.danger}`, color: COLORS.text }}
          >
            {errorMsg}
          </div>
          <button
            onClick={retake}
            className="w-full mt-4 py-2.5 rounded-full text-sm font-medium"
            style={{ background: COLORS.accent, color: '#06110E' }}
          >
            Try again
          </button>
        </div>
      )}

      {onSkip && phase === 'camera' && (
        <div className="px-5 pb-5 -mt-2 text-center">
          <button onClick={onSkip} className="text-xs underline" style={{ color: COLORS.muted }}>
            I'll do this later
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, mono }) {
  return (
    <label className="block mb-3 last:mb-0">
      <span className="text-xs" style={{ color: '#7C8798' }}>{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-1 px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
        style={{
          border: '1px solid #2A3340',
          color: '#EAEDF1',
          fontFamily: mono ? "'IBM Plex Mono', ui-monospace, monospace" : 'inherit',
          letterSpacing: mono ? '0.05em' : 'normal',
        }}
      />
    </label>
  );
}

function ViewfinderBrackets({ color }) {
  const corner = 'absolute w-6 h-6 border-2';
  return (
    <div className="absolute inset-6 pointer-events-none">
      <div className={`${corner} top-0 left-0 border-r-0 border-b-0 rounded-tl-md`} style={{ borderColor: color }} />
      <div className={`${corner} top-0 right-0 border-l-0 border-b-0 rounded-tr-md`} style={{ borderColor: color }} />
      <div className={`${corner} bottom-0 left-0 border-r-0 border-t-0 rounded-bl-md`} style={{ borderColor: color }} />
      <div className={`${corner} bottom-0 right-0 border-l-0 border-t-0 rounded-br-md`} style={{ borderColor: color }} />
    </div>
  );
}

function ScanLine({ color }) {
  return (
    <div
      className="absolute left-0 right-0 h-0.5 animate-[scan_1.8s_ease-in-out_infinite]"
      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
    >
      <style>{`
        @keyframes scan {
          0% { top: 8%; }
          50% { top: 88%; }
          100% { top: 8%; }
        }
      `}</style>
    </div>
  );
}
