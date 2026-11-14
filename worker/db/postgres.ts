import { neon, types } from "@neondatabase/serverless";

// All int8 columns hold bounded rupiah amounts, revisions or millisecond times.
types.setTypeParser(20, (value: string) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw Error("INTEGER_RANGE");
  return n;
});
export const FAMILY_LOCK = 61324017;
export type Result<T = Record<string, unknown>> = {
  results: T[];
  meta: { changes: number };
};
export class Statement {
  constructor(
    readonly db: Database,
    readonly text: string,
    readonly args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.db, this.text, args);
  }
  async all<T = Record<string, unknown>>() {
    return (await this.db.batch<T>([this]))[0];
  }
  async first<T = Record<string, unknown>>() {
    return (await this.all<T>()).results[0] ?? null;
  }
  async run() {
    return this.all();
  }
}
export class Database {
  readonly client;
  constructor(url: string) {
    this.client = neon(url);
  }
  prepare(text: string) {
    return new Statement(this, text);
  }
  async batch<T = Record<string, unknown>>(
    statements: Statement[],
  ): Promise<Result<T>[]> {
    // A family has two writers. Serialize transactions before their first data
    // statement so quota counts, relationship guards and snapshots stay coherent.
    // ReadCommitted refreshes the snapshot after acquiring the lock. No retries
    // here: a lost HTTP response may already have committed.
    const rows = await this.client.transaction(
      [
        this.client.query("SELECT pg_advisory_xact_lock($1)", [FAMILY_LOCK]),
        ...statements.map((s) => this.client.query(s.text, s.args)),
      ],
      { fullResults: true, isolationLevel: "ReadCommitted" },
    );
    return rows.slice(1).map((r) => ({
      results: r.rows as T[],
      meta: { changes: r.rowCount ?? 0 },
    }));
  }
}
