import React, { useState, useEffect, useCallback, useRef } from "react";
import { Lock, Fingerprint } from "lucide-react";

const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const PIN_KEY = "finlo_pin_hash";
const LOCK_KEY = "finlo_locked";

function hashPin(pin: string): string {
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = ((h << 5) - h + pin.charCodeAt(i)) | 0;
  }
  return String(h);
}

export const SessionLock: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locked, setLocked] = useState(
    () => sessionStorage.getItem(LOCK_KEY) === "true",
  );
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [setupMode, setSetupMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasPin = !!localStorage.getItem(PIN_KEY);

  const lock = useCallback(() => {
    if (localStorage.getItem(PIN_KEY)) {
      setLocked(true);
      sessionStorage.setItem(LOCK_KEY, "true");
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(lock, INACTIVITY_TIMEOUT);
  }, [lock]);

  useEffect(() => {
    if (locked) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [locked, resetTimer]);

  const handleUnlock = () => {
    const stored = localStorage.getItem(PIN_KEY);
    if (stored && hashPin(pin) === stored) {
      setLocked(false);
      sessionStorage.removeItem(LOCK_KEY);
      setPin("");
      setError("");
      resetTimer();
    } else {
      setError("Incorrect PIN");
      setPin("");
    }
  };

  const handleSetPin = () => {
    if (pin.length < 4 || pin.length > 6) {
      setError("PIN must be 4-6 digits");
      return;
    }
    localStorage.setItem(PIN_KEY, hashPin(pin));
    setSetupMode(false);
    setPin("");
    setError("");
  };

  if (locked && hasPin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-xs text-center space-y-6 p-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
            style={{
              background: "hsl(168 72% 48% / 0.12)",
              border: "1px solid hsl(168 72% 48% / 0.2)",
            }}
          >
            <Lock size={28} style={{ color: "#5eead4" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Session Locked
            </h2>
            <p className="text-sm text-muted mt-1">Enter your PIN to unlock</p>
          </div>
          <div className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => {
                setPin(e.target.value.replace(/\D/g, ""));
                setError("");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
              placeholder="Enter PIN"
              className="input-field text-center text-xl tracking-[0.5em] font-mono"
              autoFocus
            />
            {error && (
              <p className="text-xs" style={{ color: "#fb7185" }}>
                {error}
              </p>
            )}
            <button onClick={handleUnlock} className="btn-primary w-full">
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (setupMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-xs text-center space-y-6 p-8">
          <Fingerprint
            size={32}
            style={{ color: "#5eead4" }}
            className="mx-auto"
          />
          <h2 className="text-lg font-bold text-foreground">Set Up PIN Lock</h2>
          <p className="text-sm text-muted">
            Choose a 4-6 digit PIN for session lock
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength={6}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ""));
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && handleSetPin()}
            placeholder="4-6 digit PIN"
            className="input-field text-center text-xl tracking-[0.5em] font-mono"
            autoFocus
          />
          {error && (
            <p className="text-xs" style={{ color: "#fb7185" }}>
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setSetupMode(false)}
              className="btn-secondary flex-1"
            >
              Skip
            </button>
            <button onClick={handleSetPin} className="btn-primary flex-1">
              Set PIN
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const usePinSetup = () => ({
  hasPin: !!localStorage.getItem(PIN_KEY),
  clearPin: () => localStorage.removeItem(PIN_KEY),
  setPin: (pin: string) => localStorage.setItem(PIN_KEY, hashPin(pin)),
});
