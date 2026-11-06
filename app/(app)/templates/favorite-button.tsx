"use client";

import { useState, useTransition } from "react";
import { setFavoriteAction } from "./actions";

export function FavoriteButton({ slug, favorite }: { slug: string; favorite: boolean }) {
  const [on, setOn] = useState(favorite);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const next = !on;
            const r = await setFavoriteAction(slug, next);
            if (r.ok) {
              setOn(next);
              setError(null);
            } else setError(r.error);
          })
        }
        className="rounded border px-2 py-1 text-sm disabled:opacity-50"
      >
        {on ? "★ Favorited" : "☆ Favorite"}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </>
  );
}
