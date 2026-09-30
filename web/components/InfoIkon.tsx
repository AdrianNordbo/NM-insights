/**
 * Lite «i» som åpner en kort forklaring. Bruker nettleserens innebygde popover, så det virker på
 * mobil uten JavaScript. id må være unik på siden.
 */
export function InfoIkon({ id, text }: { id: string; text: string }) {
  const popoverId = `info-${id}`;
  return (
    <>
      <button type="button" className="info" popoverTarget={popoverId} aria-label="Forklaring">
        i
      </button>
      <span id={popoverId} popover="auto" className="info-pop">
        {text}
      </span>
    </>
  );
}

export function Forelopig() {
  return <span className="tag">foreløpig</span>;
}
