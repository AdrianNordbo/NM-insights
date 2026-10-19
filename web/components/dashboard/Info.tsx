/** Lite «i» som folder ut en forklaring. details/summary virker på mobil uten JavaScript. */
export function Info({ text, right = false, label = "Forklaring" }: { text: string; right?: boolean; label?: string }) {
  return (
    <details className={right ? "info right" : "info"}>
      <summary aria-label={label}>i</summary>
      <div className="pop">{text}</div>
    </details>
  );
}
