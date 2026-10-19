"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Filter for type innhold i heatmapet. Valget står i adressen (?konsept=…). */
export function KonseptVelger({ options, value }: { options: { key: string; label: string }[]; value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <form
      className="filters"
      method="get"
      onChange={(e) => {
        const q = new URLSearchParams(params.toString());
        const v = String(new FormData(e.currentTarget).get("konsept") ?? "alle");
        if (v === "alle") q.delete("konsept");
        else q.set("konsept", v);
        router.push(`${pathname}?${q.toString()}`, { scroll: false });
      }}
    >
      {[...params.entries()]
        .filter(([k]) => k !== "konsept")
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <label className="select">
        <span className="sr-only">Type innhold</span>
        <select name="konsept" defaultValue={value} key={value}>
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <noscript>
        <button type="submit" className="secondary">
          Vis
        </button>
      </noscript>
    </form>
  );
}
