import { useEffect, useState } from "react";
import logo from "@/assets/lmu-logo.png";

const SESSION_KEY = "lmu_splash_shown";

export function SplashScreen() {
  const [show, setShow] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SESSION_KEY)) return;
      sessionStorage.setItem(SESSION_KEY, "1");
    } catch {
      // ignore
    }
    setShow(true);
    const outTimer = setTimeout(() => setFadeOut(true), 1800);
    const hideTimer = setTimeout(() => setShow(false), 2600);
    return () => {
      clearTimeout(outTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-700 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      aria-hidden="true"
    >
      <img
        src={logo}
        alt=""
        className="w-48 h-48 sm:w-64 sm:h-64 object-contain splash-logo"
        draggable={false}
      />
    </div>
  );
}
