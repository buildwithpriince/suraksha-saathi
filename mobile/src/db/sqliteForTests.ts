/**
 * Tests only: the part of expo-sqlite's synchronous API that `db/` uses, backed by Node's built-in
 * SQLite, so the real schema, migrations and SQL run under Vitest (D-035). Never imported by the app.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

type Param = SQLInputValue;

export function openTestDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  return {
    execSync(source: string): void {
      sqlite.exec(source);
    },
    runSync(source: string, ...params: Param[]) {
      const r = sqlite.prepare(source).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    getFirstSync<T>(source: string, ...params: Param[]): T | null {
      return (sqlite.prepare(source).get(...params) as T | undefined) ?? null;
    },
    getAllSync<T>(source: string, ...params: Param[]): T[] {
      return sqlite.prepare(source).all(...params) as T[];
    },
    withTransactionSync(task: () => void): void {
      sqlite.exec('BEGIN');
      try {
        task();
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}
