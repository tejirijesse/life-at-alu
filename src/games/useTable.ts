// For two-player games: open this table on the server while the game window is up, close it
// when it goes, and keep the latest state the server sent for it (see server/games/tables.ts).

import { useEffect, useState } from "react";
import { net } from "../net";

export function useTable<S extends { table: string }>(game: string, table: string, onOther?: (data: Record<string, unknown>) => void) {
  const [state, setState] = useState<S | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const off = net.onGame(game, (d) => {
      const data = d as Record<string, unknown> & { type?: string; table?: string };
      if (data.table !== table) return;
      if (data.type === "state") {
        setState(data as unknown as S);
        setError(null);
      } else if (data.type === "error") setError(String(data.message));
      else onOther?.(data);
    });
    net.game(game, { type: "open", table });
    return () => {
      net.game(game, { type: "close", table });
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, table]);
  const send = (data: Record<string, unknown>) => net.game(game, { ...data, table });
  return { state, error, send };
}
