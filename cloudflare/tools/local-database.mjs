import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export function openPreviewDatabase(filename = path.join(repository, '.private', 'mobile-preview.sqlite')) {
  if (!existsSync(filename)) {
    const baseline = path.join(repository, '.private/ERPDB_CloudflareBaseline_20261108_115129/d1-verified');
    const report = JSON.parse(readFileSync(path.join(baseline, 'verification.json'), 'utf8'));
    if (!report.allTablesEqual || !existsSync(path.join(baseline, 'COMPLETE'))) throw new Error('A verified baseline is required.');
    mkdirSync(path.dirname(filename), { recursive: true });
    copyFileSync(path.join(baseline, 'baseline.sqlite'), filename);
  }
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS app_workspaces (owner_id TEXT PRIMARY KEY,Document TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS app_accounts (owner_id TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER NOT NULL,PRIMARY KEY(owner_id,name)) STRICT;
    CREATE TABLE IF NOT EXISTS app_members (owner_id TEXT NOT NULL,name TEXT NOT NULL,sort_order INTEGER NOT NULL,PRIMARY KEY(owner_id,name)) STRICT;
    CREATE TABLE IF NOT EXISTS app_transactions (
      owner_id TEXT NOT NULL,id TEXT NOT NULL,date TEXT NOT NULL,category TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>0),
      account TEXT NOT NULL,member TEXT NOT NULL,type TEXT NOT NULL CHECK(type IN ('支','收')),
      note TEXT NOT NULL DEFAULT '',source TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at TEXT NOT NULL,
      deleted_at TEXT,PRIMARY KEY(owner_id,id)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS app_transactions_month ON app_transactions(owner_id,date,type,category);
    CREATE INDEX IF NOT EXISTS app_transactions_recent ON app_transactions(owner_id,date DESC,created_at DESC);
    INSERT OR IGNORE INTO app_meta(key,value) VALUES ('preview-id','${randomUUID()}');
  `);
  const owner = 'local-preview:' + db.prepare("SELECT value FROM app_meta WHERE key='preview-id'").get().value;
  if (!db.prepare("SELECT value FROM app_meta WHERE key='legacy-imported'").get()) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`INSERT INTO app_workspaces SELECT ?,Document FROM legacy_FinanceWorkspace WHERE Id=1`).run(owner);
      db.prepare(`INSERT INTO app_accounts SELECT ?,AccountName,AccountId FROM legacy_Accounts`).run(owner);
      db.prepare(`INSERT INTO app_members SELECT ?,MemberName,MemberId FROM legacy_Members`).run(owner);
      db.prepare(`INSERT INTO app_transactions(owner_id,id,date,category,amount,account,member,type,note,source,fingerprint,created_at)
        SELECT ?,'legacy-'||Id,substr(Date,1,10),Category,Amount,Account,Member,TransactionType,'','legacy','',printf('%010d',Id)
        FROM legacy_Transactions`).run(owner);
      db.exec("INSERT INTO app_meta VALUES('legacy-imported','1'); COMMIT;");
    } catch(error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}
export function sqlAdapter(database) {
  return {
    prepare(sql) {
      let values = [];
      return {
        bind(...input) { values = input; return this; },
        async all() { return { results: database.prepare(sql).all(...values) }; },
        async first() { return database.prepare(sql).get(...values) ?? null; },
        async run() { return { meta: { changes: Number(database.prepare(sql).run(...values).changes) } }; }
      };
    }
  };
}
