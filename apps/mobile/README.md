# 記帳 App（iPhone，Expo）

台灣單機記帳 App：資料只存手機的 SQLite，沒有伺服器。規格見 `.scratch/finance-product/spec.md`，決定見 `docs/adr/0005`、`0006`。Expo 版本差異請先讀 `AGENTS.md`。

## 目錄分層（依賴只往下）

| 目錄 | 內容 | 規則 |
| --- | --- | --- |
| `src/app/` | Expo Router 路由與畫面 | 只顯示與收集輸入；不碰資料庫、不含帳務規則 |
| `src/ui/` | 共用元件、`LedgerProvider`、格式化 | 同上，只能拿到 `Ledger` |
| `src/ledger/` | 帳本服務：指令、查詢、驗證、結構遷移、預設分類與帳戶 | 唯一的測試切入點 |
| `src/calc/` | 純計算（日期、月曆格子、預算與月結引擎；之後放 CSV 解析） | 純函式，不碰資料庫 |
| `src/db/` | 資料庫驅動介面、遷移機制、兩個實作 | `nodeDriver.ts`（測試）、`expoDriver.ts`（手機） |
| `src/platform/` | 手機端接線（驅動接帳本服務） | 唯一同時認識兩者的地方 |

慣例：金額為新台幣整數；日期是台北時間 `YYYY-MM-DD`，月份是 `YYYY-MM`；原始碼內 import 要寫 `.ts` 副檔名，且只用可抹除的 TypeScript 語法（不用 enum、參數屬性），這樣 Node 能直接執行 `.ts`（`tsconfig.json` 的 `erasableSyntaxOnly` 會把關）。

## 指令

```bash
npm install
npm test            # node --test，經由帳本服務驗證，用 Node 內建 SQLite，不需 iPhone
npm run typecheck   # tsc --noEmit
npx expo export --platform ios   # 驗證 JS 能打包（Linux 可跑）
npx expo start      # 開發（需要 iPhone 與 Expo Go／開發版）
```

## 資料庫

- 檔名 `ledger.db`，放 expo-sqlite 預設目錄（iOS 為 Documents/SQLite），會被 iCloud 裝置備份。
- 結構版本記在 `PRAGMA user_version`；遷移在 `src/ledger/migrations.ts`，已發佈的遷移不可改，要改就新增下一版。
- 資料庫版本比 App 新時拒絕開啟。

## 新增指令或查詢的流程

先在 `src/ledger/ledger.test.ts` 寫一個失敗的測試（開全新記憶體資料庫、下指令、查結果），再實作到通過。

## 預算與月結（票 03）

- 引擎：`src/calc/budgetEngine.ts`（狀態＋指令 → 新狀態，移植自舊系統 `BudgetEngine.cs`）、`budgetTypes.ts`、`budgetDocument.ts`（舊財務文件 JSON ↔ 引擎狀態；PascalCase ↔ camelCase，字典鍵與 Checks 原樣）。
- 財務文件存在資料表 `finance_document`（遷移版本 2），內容是舊系統格式的 JSON；只能經帳本服務的 `runBudgetCommand`、`importFinanceDocument` 寫入。
- 已結月份鎖定只在 `src/ledger/monthLock.ts` 一處檢查；之後的修改、刪除、匯入交易都呼叫 `assertDateOpen`。

