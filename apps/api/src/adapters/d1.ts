import type { SqlDb, Stmt } from "./sql";

// Structural slice of Cloudflare's D1 binding, so this file needs no workers types.
type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  all<T>(): Promise<{ results: T[] }>;
};
export type D1Like = {
  prepare(sql: string): D1Statement;
  batch(stmts: D1Statement[]): Promise<{ meta: { changes: number } }[]>;
};

export function d1SqlDb(d1: D1Like): SqlDb {
  const prep = (s: Stmt) => d1.prepare(s.sql).bind(...(s.params ?? []));
  return {
    async all<T>(sql: string, params: Stmt["params"] = []) {
      return (await prep({ sql, params }).all<T>()).results;
    },
    async batch(stmts) {
      if (stmts.length === 0) return [];
      // D1 runs a batch as one transaction.
      return (await d1.batch(stmts.map(prep))).map((r) => r.meta.changes);
    },
  };
}
