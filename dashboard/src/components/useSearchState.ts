import { useSearchParams } from "react-router";

/** Filters and page number live in the URL, so links (e.g. heatmap cells) and Back work. */
export function useSearchState<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams();
  const values = Object.fromEntries(keys.map((k) => [k, params.get(k) ?? ""])) as Record<K, string>;
  const page = Math.max(1, Number(params.get("page")) || 1);

  function set(changes: Partial<Record<K | "page", string | number>>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v === "" || v === undefined || v === null) next.delete(k);
          else next.set(k, String(v));
        }
        // a filter change starts again at page 1
        if (!("page" in changes)) next.delete("page");
        return next;
      },
      { replace: true },
    );
  }

  return { values, page, set };
}

export const parseBool = (v: string): boolean | undefined => (v === "true" ? true : v === "false" ? false : undefined);
