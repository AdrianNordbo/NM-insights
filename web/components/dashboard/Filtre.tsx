"use client";

import { usePathname, useRouter } from "next/navigation";

type Option = { key: string; label: string };

/**
 * Nedtrekk for plattform (og periode). Et vanlig GET-skjema: uten JavaScript sendes det med knappen,
 * med JavaScript byttes siden straks et valg endres. Valgene står i adressen (?plattform=…&periode=…).
 */
export function Filtre({
  plattformer,
  plattform,
  perioder,
  periode,
  extra = {},
}: {
  plattformer: Option[];
  plattform: string;
  perioder?: Option[];
  periode?: string;
  extra?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const go = (form: HTMLFormElement) => {
    const q = new URLSearchParams();
    for (const [k, v] of new FormData(form)) q.set(k, String(v));
    router.push(`${pathname}?${q.toString()}`, { scroll: false });
  };
  return (
    <form
      className="filters"
      method="get"
      onChange={(e) => go(e.currentTarget)}
      onSubmit={(e) => {
        e.preventDefault();
        go(e.currentTarget);
      }}
    >
      {Object.entries(extra).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="select">
        <span className="sr-only">Plattform</span>
        <select name="plattform" defaultValue={plattform} key={plattform}>
          {plattformer.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {perioder && (
        <label className="select">
          <span className="sr-only">Periode</span>
          <select name="periode" defaultValue={periode} key={periode}>
            {perioder.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <noscript>
        <button type="submit" className="secondary">
          Vis
        </button>
      </noscript>
    </form>
  );
}
