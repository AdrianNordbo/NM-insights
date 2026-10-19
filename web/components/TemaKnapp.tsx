"use client";

import { useState } from "react";

/**
 * Slår mørk modus av og på mens siden er åpen. Ingen cookie og ingen lagring: siden starter lys
 * ved hvert besøk. Temaet settes som data-theme på <html>, så det gjelder hele siden og består når
 * man bytter side eller valg (layouten lastes ikke på nytt).
 */
export function TemaKnapp() {
  const [dark, setDark] = useState(false);

  function toggle() {
    const next = !dark;
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    // Alle temaknappene (sidemeny og mobilmeny) viser samme tilstand
    document.querySelectorAll<HTMLButtonElement>("[data-tema]").forEach((b) => b.setAttribute("aria-pressed", String(next)));
    setDark(next);
  }

  return (
    <button type="button" className="side-button" data-tema onClick={toggle} aria-pressed={dark} title={dark ? "Bytt til lys modus" : "Bytt til mørk modus"}>
      {dark ? "Lys modus" : "Mørk modus"}
    </button>
  );
}
