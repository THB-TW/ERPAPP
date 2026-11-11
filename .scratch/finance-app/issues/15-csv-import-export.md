# 15 — 記帳 CSV 匯入與匯出

**What to build:** 使用者在設定匯入其他 App 的記帳 CSV（只要有類別與金額），也能直接匯入天天記帳的匯出檔；看到新增、略過、拒收各幾筆與原因。也能把全部交易匯出成同一格式的 CSV。

**Blocked by:** 07 記帳畫面

**Status:** done（2026-11-11；CSV 原生選檔與分享已接線，iPhone 實機待驗收）

**Owner:** `import-export-backup`（見 `docs/agents/team.md`）　**Spec:** [規格](../../finance-product/spec.md)

- [x] 必要欄位為類別與金額；日期、帳戶、收支別、備註、成員缺漏或格式不合時套用預設（今天、現金、支出、空白），並回報套用了預設的列數
- [x] 自動辨識天天記帳 12 欄標題列，解析規則沿用舊系統
- [x] 分類不存在、金額無法解析、落在已結月份的列拒收，原因分開回報
- [x] 重複匯入不新增重複交易，合法的同日同類別同金額多筆保留（數量式去重，鍵為日期｜類別｜金額）
- [x] 支援 Big5 與 UTF-8
- [x] 匯出全部交易為 UTF-8 CSV，欄位同匯入規格，匯出再匯入不產生新增
- [x] App 內有一頁 CSV 規格說明
- [x] 以上有測試，含畸形檔案

## Comments

2026-11-11 待確認（票 01 審查時發現）：App 的分類帶有收支別，且帳本服務拒絕「收入分類記成支出」或反過來。舊帳與其他 App 的 CSV 可能有同一個分類同時用在收入與支出（例如退款記成該分類的收入）。做這張票時先用真實檔案的形狀確認；若有這種情況，要決定是放寬規則、拆成兩個分類，還是用負數支出表示，並回報翰陞決定，不自行改義。

2026-11-11（票 04 完成後）：成員已是獨立資料表。CSV 的「成員」欄遇到不存在的成員要怎麼處理（拒收、自動建立、當成空白）規格只寫「缺漏或格式不合時套預設」，做這張票時先定案。交易驗證規則在 `src/ledger/transactionRules.ts`，匯入要共用。


2026-11-11 完成（程式、自動測試及 iOS 打包；以下實機步驟尚未執行）：
- 新增帳本服務 `importTransactionsCsv`、`exportTransactionsCsv`，指令放在 `src/ledger/csvTransactions.ts`；`index.ts` 僅加入型別與序列化／SQLite 交易接線，沒有修改 `errors.ts`。純 CSV 讀寫、UTF-8／Big5 編碼、數量式去重分別獨立，去重流程只寫一次，來源／目的地可供後續匯入共用。
- 只強制類別（可寫分類）與金額；日期、帳戶、收支別、備註及成員缺漏／不合格式時套預設。不存在的成員留空，不自動建立。套用預設的列數包含最後略過或拒收的列，並附各列欄位。分類不存在列出名稱、不自動建分類；零、負數、小數、不安全整數及分類／收支衝突維持既有拒收規則，不自行把退款改義。之前 Comments 的混合收支疑問以此保守行為處理，沒有讀真實檔案。
- 支援舊 12 欄標題、由右定位收支（未加引號的備註逗號容錯）、日期三種格式、千分位、雙引號跳脫與多行備註。一般檔多餘欄位逐列拒收；缺必要／重複標題、破損引號或無法解碼時整檔不寫入。可見文案只用「其他 App 搬家（匯入 CSV）」，沒有競品名稱。
- UTF-8／Big5 解碼器與 WHATWG Big5 字碼表隨 App 打包，不靠執行環境的 TextDecoder／TextEncoder，不新增套件。字碼表附官方來源、識別 hash 及 BSD 授權。UTF-8 匯出帶 BOM，全部交易均包含（含已結月份與開帳日前），精確保留備註及成員。
- 數量式去重鍵為日期／類別／金額（以穩定分類編號對應既有名稱），不含帳戶、收支別、備註及成員；保留合法重複交易。名稱先用原字串精確比對，再嘗試去除輸入前後空白，避免大小寫或空白不同的分類／帳戶／成員互相覆蓋。已結月份先拒收，再對通過驗證的列去重，所以已結交易回匯回報拒收，新增仍為 0。
- 帳戶預設補充：優先使用既有現金類帳戶；若帳本完全沒有現金類帳戶，只在確實新增需要預設帳戶的交易時補建一個開帳餘額為 0 的現金帳戶。若「現金」已被其他種類帳戶使用，採「現金（2）」等未使用名稱；不覆寫原帳戶。全部拒收或重複略過時不建帳戶。這是為滿足選填帳戶錯誤仍須套預設的規則所採作法，畫面規格已說明。
- 設定只增加「匯入 CSV」入口；子頁為 `csv-import.tsx`、`csv-spec.tsx`，沒有改 `_layout.tsx`。現在可貼上 CSV 匯入、查看新增／略過／拒收及預設明細；匯出指令免費且無訂閱判斷。`src/csv/filePort.ts` 是小型選檔／分享介面，目前明確回報「尚未支援」，票 16 合併後只需替換該物件實作，即可接 document-picker／sharing，不需改帳務邏輯。
- 資料庫沒有結構變更，無新增遷移（分配的 v6 未使用）；沒有修改 package.json／package-lock.json 或本票禁改檔案。
- TDD：先由帳本入口建立 12 個失敗測試，再實作；審核發現的大小寫／前後空白錯配與現金預設邊界另先加失敗回歸再修。最終 CSV 測試 20／20 通過；`npm test` 共 174 個，173 通過、1 個既有例外失敗（`tools/legacy-compare/run.test.ts` 的 `/var` 與 `/private/var` 路徑別名），未修改該測試；`npm run typecheck` 通過；iOS `expo export` 成功（1,218 模組）。套件沒有 lint script，亦未安裝 ESLint，沒有執行會補裝套件的 lint。
- legacy-migration 交叉確認：匯入共用 `assertDateOpen` 與 `insertTransaction`；已結／期初基準月拒收，財務文件逐字及月結快照不變。假資料重匯後，收入 1,000、實支 120、月結盈餘與帳面總資產皆 880，只計一次。未改月結引擎、舊帳帶入或比對基準；證據只限合成資料，不代表私人 58 個月驗收。未讀或複製私人帳本／CSV。

待 iPhone 實機驗收（全部使用自造假資料）：
1. 設定 → 匯入 CSV → CSV 規格說明；返回後輸入保留，畫面沒有競品名稱。
2. 貼上「類別,金額」與兩筆同日同分類同額交易，確認首次新增 2 筆、套預設列數為 2；當天再次匯入略過 2 筆。要跨天重匯時請保留日期，避免預設日期改變去重鍵。
3. 混入未知分類、壞金額、錯誤日期／帳戶／成員，確認拒收原因、缺分類清單及預設值明細；成員不會被建立，沒有現金帳戶時僅確實新增交易才補建。
4. 貼上 12 欄假資料，含逗號、雙引號、多行備註及收入列；返回記帳頁核對日期、分類、帳戶、金額、收支及備註。
5. 匯入已結月份（含期初基準）交易，確認拒收、原交易與月結數字不變；含大小寫／前後空白不同名稱的帳本也應精確歸屬。
6. 鍵盤開啟時可捲動到匯入；快速連點只執行一次，返回再進頁面不顯示過期結果。
7. 選擇 UTF-8／Big5 假 CSV 後按匯入，核對中文、金額與結果；取消選檔應保留原輸入且不改帳。貼上 CSV 的備援仍可使用。
8. 按匯出，經系統分享存到「檔案」或 AirDrop，確認檔名、中文、emoji 及多行備註；取消分享後可重試，匯出回匯不新增（已結列仍拒收）。確認暫存副本會清理。Big5 在 iPhone 上的解碼必須實測。

2026-11-11 提交狀態：`git add` 在建立 `/Users/chenhansheng/Documents/Account_app/ERPAPP/.git/worktrees/wt-15/index.lock` 時被執行環境拒絕（`Operation not permitted`）；目前環境禁止提權，故尚未建立 commit。所有變更保留在本專用 worktree，沒有 push、開 PR 或更換分支。預定 commit 訊息為「完成記帳 CSV 匯入匯出與規格畫面」，結尾 trailer 為 `Co-Authored-By: Codex <noreply@openai.com>`。


2026-11-11 整合分支對齊與原生接線完成（取代前述暫時「尚未支援」狀態）：
- 解決 `src/app/(tabs)/settings.tsx` 與 `src/ledger/index.ts` 的所有衝突標記。設定採 xdtlp5 新版清單，只在 ROWS 加一列 CSV，保留備份列；帳本入口保留 CSV、明細與備份兩邊功能。依本輪指示只改工作檔，未執行 git add／commit 或其他合併控制指令，所以 Git index 仍會顯示 UU，內容衝突已解。
- CSV 匯入保留 openLedger 內 tracked `db.transaction`（不是 rawDb），實際新增會自動更新 ledger_meta.last_modified_at；匯出、全數重複略過、逐列拒收、畸形檔案整檔失敗不會更新。新增帳本入口／真 SQLite 整合回歸，修衝突前因標記導致語法失敗，解決後通過。
- 票 16 的 v4（ledger_meta 與 application_id）保持原樣，不新增遷移，CSV 分配的 v6 仍不需要。`tools/legacy-convert/convert.test.ts` 的資料表清單已由合併版本包含 ledger_meta，確認保留，未另改。
- `src/csv/filePort.ts` 已改為真正的原生介面：沿用票 16 的 getDocumentAsync／isAvailableAsync／shareAsync；選檔複製到 App 快取後用 File.bytes() 取原始位元組，交由帳本服務既有 UTF-8／Big5 解碼，取消回傳 null。匯出在每次獨立 UUID 快取目錄以 File.write(bytes) 寫入 CSV，經 expo-sharing 分享；完成、取消或失敗皆清理本次暫存檔，只處理自己的快取副本，不碰來源原檔。
- 一般 CSV 位元組讀寫使用 Expo 本身已依賴且現有鎖檔內已有的 expo-file-system 公開 File／Directory／Paths API。`tsconfig.json` 僅補其頂層／Expo 巢狀套件解析候選，TypeScript 與 Expo 預設 Metro 共用；沒有新增套件或更改 package.json／package-lock.json，也不依賴私有原生 API。依既有鎖檔執行離線 `npm ci --legacy-peer-deps --ignore-scripts`，乾淨安裝後已通過型別檢查與 iOS 打包。
- `src/app/csv-import.tsx` 已移除尚未支援文案並顯示原生讀檔／分享錯誤的繁中訊息，貼上 CSV 備援保留；沒有改 _layout 或本票禁改檔。
- 本輪最終 `npm test`：210 個，209 通過、1 個已知 legacy-compare macOS `/var`／`/private/var` 路徑別名失敗（未改該測試）；其中 CSV 測試 21／21 通過。`npm run typecheck` 通過；iOS `expo export` 成功。沒有 lint script／ESLint，未自行補裝。legacy-migration 最終交叉審核通過，另重跑 CSV／備份／交易／預算共 58／58 通過，未改月結計算或舊帳基準。所有測試僅合成資料；未讀私人帳本或 CSV。
- 實機待驗收：依上方更新後第 7、8 步驗選檔／取消、UTF-8／Big5、系統分享存檔／AirDrop／取消、再次匯入及暫存清理；原生選檔與分享尚未在 iPhone 上實測。
