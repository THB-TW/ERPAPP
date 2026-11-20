# UI2 整合驗收版

驗收分支 `claude/ui2-acceptance` 已同步基底 `228b78e`，並整合 01～06 的最新版。來源提交依票號為 `ccda51d`、`ab8ec74`、`4f776c2`、`d7c6064`、`dc6de71`、`a1d09fb`。05 的月結管理供 06 共用。原始 PR #35～#40 保留，xdtlp5 未更新。

## 安裝到 iPhone

這個分支專用的 App 名稱是 **Afterbills UI2**，bundle identifier 為 `tw.thbtw.ledger.ui2acceptance`，URL scheme 為 `ledger-ui2`。與原本 `tw.thbtw.ledger.dev` 分開，不沿用原 App 資料。請在這個 worktree 建置，勿改回原識別碼或匯入私人帳本。

連接並解鎖 iPhone，啟用開發者模式；Mac 的 Xcode 需已有可用的 Apple 開發簽署設定。執行：

```sh
cd /Users/chenhansheng/Documents/Account_app/wt-ui2-acceptance/apps/mobile
npm ci
EXPO_PUBLIC_IAP=off npx expo run:ios --device --configuration Release
```

選擇你的 iPhone。Expo 會生成原生專案、安裝 Pods（含新的日期套件）、編譯並安裝。Release 將 JavaScript 打包進 App，驗收時可以離開 Mac。若 Xcode 要求選 Team 或 iPhone 要求信任開發者，依裝置提示處理。

`EXPO_PUBLIC_IAP=off` 使用專案既有的開發版權益開關，讓月結／搬錢可驗收；只供此測試版使用。第一次啟動請建立測試帳本，帳戶金額、交易都用虛構資料。

## 同一個 App 依序驗收

1. [01](issues/01-report-swipe-paging.md)：明細慢拖跟手、短拖彈回、快滑翻頁、點按切換及垂直捲動。
2. [02](issues/02-report-colors-all-categories.md)：未歸屬／其他合灰色切片，列表分列，收入全部彩色。
3. [03](issues/03-date-pickers.md)：貸款月份含未定、投資期初月份、交易日期滾輪、資產核對日期上下限。
4. [04](issues/04-unmapped-to-other.md)：未歸屬支出計入其他、不擋月結；指定新歸屬後開放月份改計，歷史不變。
5. [05](issues/05-remove-reversal-close-management.md)：設定的月結管理提供撤銷／更正，調整頁沒有新沖銷入口。
6. [06](issues/06-adjustment-visual-mode.md)：設定切換圖像／清單；有最近已結月份及正餘額後，測試長按錢包／罐子、拖放、原因、上限、預覽確認與紀錄。可先用點來源再點目標驗證帳務，再驗證手勢。

01 的跟手、彈回及翻頁有[模擬器錄影](evidence/01/report-paging.mp4)，06 有[錢包拖曳](evidence/06/drag-in-progress.png)及[放手後的面板](evidence/06/drag-amount-sheet.png)截圖。請在 iPhone 確認手感、觸感及各票的完整操作。

## 整合檢查（2026-11-19）

- `npm ci`：成功。
- `TMPDIR=/private/tmp npm test` 通過 567 項，0 失敗或跳過。
- `npx tsc --noEmit`：exit 0。
- `EXPO_OFFLINE=1 CI=1 npx expo export --platform ios`：exit 0。
- `git diff --check`：通過。

TMPDIR 用 macOS 正規路徑，避免既有備份測試的 /var 別名差異。已檢視自動整合的明細頁、共用 kit 與帳本入口，兩種明細改動同時保留。沒有新增帳務規則；原票的服務層 Red→Green 測試全部納入。

暫存的 Expo SDK 58 預設 ESLint 設定回報 27 個錯誤和 48 個警告，未列為通過。所有檢查只用合成測試資料，原工作目錄的未提交內容與真實帳本未動。

Expo 建置命令參考：https://docs.expo.dev/more/expo-cli/#compiling
