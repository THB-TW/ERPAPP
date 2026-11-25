import type { Migration } from '../db/migrate.ts';
import { DEFAULT_ACCOUNTS, V1_SEED_CATEGORIES } from './defaults.ts';
import { fillDefaultIcons } from './icons.ts';
import { BACKUP_APPLICATION_ID } from './backup.ts';
import { parseBudgetDocument } from '../calc/budgetDocument.ts';
import { initializeLegacyTuition } from './loanMigration.ts';

// 帳本的結構遷移。金額為新台幣整數（INTEGER），日期為台北時間的 YYYY-MM-DD 字串（TEXT）。
export const ledgerMigrations: readonly Migration[] = [
  {
    version: 1,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE accounts (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          kind TEXT NOT NULL CHECK (kind IN ('cash','bank','credit_card','e_wallet')),
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          flow TEXT NOT NULL CHECK (flow IN ('expense','income')),
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE transactions (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          category_id INTEGER NOT NULL REFERENCES categories(id),
          account_id INTEGER NOT NULL REFERENCES accounts(id),
          flow TEXT NOT NULL CHECK (flow IN ('expense','income')),
          amount INTEGER NOT NULL CHECK (amount > 0),
          note TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX transactions_by_date ON transactions(date);
      `);
      for (const [i, a] of DEFAULT_ACCOUNTS.entries()) {
        await tx.run('INSERT INTO accounts (name, kind, sort_order) VALUES (?, ?, ?)', [a.name, a.kind, i]);
      }
      for (const [i, c] of V1_SEED_CATEGORIES.entries()) {
        await tx.run('INSERT INTO categories (name, flow, sort_order) VALUES (?, ?, ?)', [c.name, c.flow, i]);
      }
    },
  },
  {
    // 財務文件（ADR 0005）：整份預算狀態存成一份帶版本號的 JSON。單一帳本只有一列（id 固定為 1）；
    // 還沒有任何預算指令或匯入時沒有這一列，讀取時視為空狀態。document 內容沿用舊系統
    // 財務文件的 JSON 格式（PascalCase，見 src/calc/budgetDocument.ts），所以舊帳文件可原樣匯入。
    version: 2,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE finance_document (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          version INTEGER NOT NULL CHECK (version >= 0),
          document TEXT NOT NULL
        );
      `);
    },
  },
  {
    // 成員、帳戶開帳餘額、設定（票 04 舊帳轉換；票 08 帳戶餘額接著用）。
    // - 成員為選填：transactions.member_id 可為 NULL，既有的記帳不需要指定成員。
    // - 開帳日是全域設定（規格「資料模型」：設定＝開帳日、發薪日…），存在 settings（key = 'opening_date'）；
    //   帳戶只有開帳餘額（新台幣整數，信用卡填未繳金額的負數）。是否停用由票 08 新增。
    version: 3,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE members (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL
        );
        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        ALTER TABLE transactions ADD COLUMN member_id INTEGER REFERENCES members(id);
        ALTER TABLE accounts ADD COLUMN opening_balance INTEGER NOT NULL DEFAULT 0;
      `);
    },
  },
  {
    // 備份檔（票 16）：帳本檔頭寫入識別標記（application_id），並新增 ledger_meta 存最後修改時間、
    // 上次備份時間。ledger_meta 不放在 settings，是因為舊帳帶入要求 settings 是空的。
    version: 4,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE ledger_meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
      `);
      // 升級前就有帳的帳本：以升級當下當作最後修改時間（格式同 toISOString），
      // 之後匯入較舊的備份才會警告。全新的帳本不補。
      await tx.exec(`
        INSERT INTO ledger_meta (key, value)
        SELECT 'last_modified_at', strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE EXISTS (SELECT 1 FROM transactions) OR EXISTS (SELECT 1 FROM finance_document);
      `);
      // PRAGMA 不能帶參數；值是程式內的常數。
      await tx.exec(`PRAGMA application_id = ${BACKUP_APPLICATION_ID}`);
    },
  },
  {
    // 票 08 預先分配 v5；v4 可稍後補入，由遷移器逐版記錄，不能只看最高版本跳過。
    version: 5,
    async up(tx) {
      await tx.exec(`
        ALTER TABLE accounts ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1));
        CREATE TABLE transfers (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL CHECK (date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
          from_account_id INTEGER NOT NULL REFERENCES accounts(id),
          to_account_id INTEGER NOT NULL REFERENCES accounts(id),
          amount INTEGER NOT NULL CHECK (amount > 0),
          note TEXT NOT NULL DEFAULT '',
          CHECK (from_account_id <> to_account_id)
        );
        CREATE INDEX transfers_by_date ON transfers(date);
      `);
    },
  },
  {
    // 票 19 預先分配 v10；schema_migrations 逐版記錄，v6～v9 日後補入仍會執行。
    version: 10,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE loans (
          id INTEGER PRIMARY KEY,
          category_id INTEGER UNIQUE REFERENCES categories(id),
          created_month TEXT NOT NULL,
          legacy INTEGER NOT NULL CHECK (legacy IN (0, 1))
        );
        CREATE TABLE loan_terms (
          id INTEGER PRIMARY KEY,
          loan_id INTEGER NOT NULL REFERENCES loans(id),
          month TEXT NOT NULL,
          name TEXT NOT NULL,
          total_amount INTEGER,
          monthly_payment INTEGER,
          remaining_principal INTEGER,
          expected_end_month TEXT,
          reason TEXT NOT NULL,
          time TEXT NOT NULL
        );
        CREATE TABLE loan_closes (
          close_id TEXT NOT NULL,
          loan_id INTEGER NOT NULL REFERENCES loans(id),
          month TEXT NOT NULL,
          snapshot TEXT NOT NULL,
          PRIMARY KEY (close_id, loan_id)
        );
      `);
      const row = await tx.get<{ document: string }>('SELECT document FROM finance_document WHERE id = 1');
      if (row) await initializeLegacyTuition(tx, parseBudgetDocument(row.document));
    },
  },
  {
    // 票 12 固定使用 v11；中間預留版本由 schema_migrations 各版獨立判斷。
    version: 11,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE card_statements (
          id INTEGER PRIMARY KEY,
          date TEXT NOT NULL,
          merchant TEXT NOT NULL,
          amount INTEGER NOT NULL CHECK (amount >= 0),
          account_id INTEGER NOT NULL REFERENCES accounts(id)
        );
        CREATE INDEX card_statements_by_card_date ON card_statements(account_id, date);
      `);
    },
  },
  {
    // 票 20 固定 v13；schema_migrations 逐版記錄，之後補入 v6～v12 仍會執行。
    version: 13,
    async up(tx) {
      await tx.exec(`
        CREATE TABLE investment_holdings (
          id INTEGER PRIMARY KEY, asset_class TEXT NOT NULL CHECK(asset_class IN ('stock','crypto')),
          symbol TEXT, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1))
        );
        CREATE UNIQUE INDEX investment_stock_symbol ON investment_holdings(symbol COLLATE NOCASE) WHERE symbol IS NOT NULL;
        CREATE UNIQUE INDEX investment_crypto_bucket ON investment_holdings(asset_class) WHERE asset_class='crypto';
        CREATE TABLE investment_transactions (
          id INTEGER PRIMARY KEY, holding_id INTEGER NOT NULL REFERENCES investment_holdings(id), date TEXT NOT NULL,
          tx_type TEXT NOT NULL CHECK(tx_type IN ('opening','buy','sell','dividend')), amount INTEGER NOT NULL CHECK(amount>=0),
          quantity TEXT, fund_source TEXT NOT NULL CHECK(fund_source IN ('internal','external')),
          account_id INTEGER REFERENCES accounts(id), note TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX investment_transactions_by_date ON investment_transactions(date,id);
        CREATE TABLE investment_opening (id INTEGER PRIMARY KEY CHECK(id=1), as_of_month TEXT NOT NULL, net_deployed INTEGER NOT NULL);
        CREATE TABLE investment_valuations (
          id INTEGER PRIMARY KEY, holding_id INTEGER NOT NULL REFERENCES investment_holdings(id), as_of TEXT NOT NULL,
          unit_price TEXT, market_value INTEGER
        );
        CREATE INDEX investment_valuations_by_holding ON investment_valuations(holding_id,as_of,id);
      `);
    },
  },
  {
    // 成員必填、圖示（2026-11-24 翰陞定案）：成員與分類各加選填的「圖示」欄位（一個表情符號，名稱不變，
    // 所以 CSV 匯入與舊帳比對仍用名字對應）；成員加「使用中」與「自己」標記。
    // 既有沒有成員的交易補成「自己」：沒有叫「自己」的成員才新建。空帳本不建成員（舊帳匯入要求成員表是空的），
    // 第一次需要時才由帳本服務建立。金額完全不動。
    version: 14,
    async up(tx) {
      await tx.exec(`
        ALTER TABLE members ADD COLUMN icon TEXT;
        ALTER TABLE members ADD COLUMN active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1));
        ALTER TABLE members ADD COLUMN is_self INTEGER NOT NULL DEFAULT 0 CHECK (is_self IN (0,1));
        ALTER TABLE categories ADD COLUMN icon TEXT;
      `);
      const existing = await tx.get<{ id: number }>("SELECT id FROM members WHERE name = '自己' COLLATE NOCASE");
      const orphan = await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE member_id IS NULL');
      let selfId = existing?.id ?? null;
      if (selfId === null && (orphan?.n ?? 0) > 0) {
        const first = await tx.get<{ low: number | null }>('SELECT MIN(sort_order) AS low FROM members');
        selfId = (await tx.run("INSERT INTO members (name, sort_order) VALUES ('自己', ?)", [(first?.low ?? 1) - 1])).lastInsertRowId;
      }
      if (selfId !== null) {
        await tx.run('UPDATE members SET is_self = 1 WHERE id = ?', [selfId]);
        await tx.run('UPDATE transactions SET member_id = ? WHERE member_id IS NULL', [selfId]);
      }
    },
  },
  {
    // 內建圖示與新帳本預設（2026-11-25 翰陞定案）：帳戶加圖示欄位；分類、帳戶與「自己」只把空白圖示依名稱補上，
    // 不動名稱與金額。還沒開始用的新帳本（沒有交易也沒有財務文件）拿掉 v1 種子的「其他收入」；已在用的帳本不動。
    version: 15,
    async up(tx) {
      await tx.exec('ALTER TABLE accounts ADD COLUMN icon TEXT;');
      const has = async (table: string) => !!(await tx.get("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table]));
      const used = await tx.get<{ n: number }>(
        'SELECT (SELECT COUNT(*) FROM transactions) + (SELECT COUNT(*) FROM finance_document) AS n',
      );
      if ((used?.n ?? 0) === 0 && !(await has('loans') && await tx.get("SELECT 1 FROM loans l JOIN categories c ON c.id = l.category_id WHERE c.name = '其他收入'"))) {
        await tx.run("DELETE FROM categories WHERE name = '其他收入' AND flow = 'income'");
      }
      // 測試可能跳過個別版本；圖示欄位（v14）不在就不補。
      if (await tx.get("SELECT 1 FROM pragma_table_info('categories') WHERE name = 'icon'")) await fillDefaultIcons(tx);
    },
  },
];
