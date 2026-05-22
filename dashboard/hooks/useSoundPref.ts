"use client";

import { useEffect, useState } from "react";

const KEY = "dm.soundEnabled";
const EVT = "dm:sound-pref-changed";

function read(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return true; // default: acik
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

function write(value: boolean) {
  try {
    window.localStorage.setItem(KEY, value ? "1" : "0");
  } catch {
    /* sessiz */
  }
  // Ayni sekmedeki diger useSoundPref'lerin senkron olmasi icin custom event.
  window.dispatchEvent(new Event(EVT));
}

// Tum sayfalarda paylasilan ses tercihi (acik/kapali).
// localStorage'da saklanir, sekmeler/komponent'ler arasi senkronizasyon
// hem 'storage' hem ozel 'dm:sound-pref-changed' event'i ile yapilir.
export function useSoundPref(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(true);

  useEffect(() => {
    setEnabled(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setEnabled(read());
    };
    const onLocal = () => setEnabled(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVT, onLocal);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVT, onLocal);
    };
  }, []);

  const set = (v: boolean) => {
    setEnabled(v);
    write(v);
  };

  return [enabled, set];
}

// Kisa, yumusak ding sesi. Web Audio API ile uretildigi icin dosya gerekmiyor.
// Kullanici user-gesture vermeden cagrildiginda tarayici sessizce reddedebilir.
export function playBeep() {
  if (typeof window === "undefined") return;
  if (!read()) return; // kapali
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    // Yumusak attack/decay envelope — ani patlama yerine kibarca girip cikar.
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 350);
  } catch {
    /* sessiz */
  }
}
