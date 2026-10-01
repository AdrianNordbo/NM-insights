"use client";

import { useState } from "react";

/**
 * Slår mørk modus av og på mens siden er åpen. Ingen cookie og ingen lagring: siden starter lys
 * ved hvert besøk. Temaet settes som data-theme på <html>, så det gjelder hele siden og består når
 * man bytter fane eller periode (layouten lastes ikke på nytt).
 */
export function TemaKnapp() {
  const [dark, setDark] = useState(false);

  function toggle() {
    const next = !dark;
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    setDark(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-pressed={dark}
      aria-label="Mørk modus"
      title={dark ? "Bytt til lys modus" : "Bytt til mørk modus"}
    >
      {dark ? (
        // Sol: trykk for lys modus
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        // Måne: trykk for mørk modus
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
