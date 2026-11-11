# 2026-11-11：mobile lockfile 修復

已修復 `apps/mobile/package.json` 與 `package-lock.json` 的依賴樹缺漏；刪除 `node_modules` 後，正常 `npm ci` 成功。環境為 Node 26.7.0、npm 11.19.0、Expo 58.0.23、expo-doctor 1.21.6。

## 套件異動

以下四項原本未列為直接依賴，也未收錄於 lockfile；全部以 `npx expo install react-dom react-native-gesture-handler react-native-reanimated react-native-worklets` 安裝，版本核對 `expo@58.0.23/bundledNativeModules.json`。

| 新增直接依賴 | package.json 版本 | lockfile 版本 | 原生模組 | 原因 |
| --- | --- | --- | --- | --- |
| react-dom | 19.3.0 | 19.3.0 | 否 | Router 的 Radix UI 等間接依賴需要；固定與 React 同版 |
| react-native-gesture-handler | ~3.3.0 | 3.3.0 | 是 | Router 內含的 react-native-drawer-layout 宣告必要 peer |
| react-native-reanimated | 4.7.1 | 4.7.1 | 是 | 同上 |
| react-native-worklets | 0.13.0 | 0.13.0 | 是 | Reanimated 4.7.1 的必要 peer |

目前畫面沒有使用 Drawer，但正常 npm 解析仍會帶入上述必要 peer。明列三個原生套件是為了固定 SDK 相容版本，不新增 Drawer 功能。修正前暫裝時 npm 選到 react-dom 19.3.1、Gesture Handler 3.5.0、Worklets 0.13.1；其中 react-dom 要求 React ^19.3.1，`npm ls` 已確認與現有 React 19.3.0 衝突。

lockfile 共新增 19 個套件節點；除上述四項，間接補入以下 15 個節點，均為 JavaScript、型別或建置工具，沒有其他新增的原生模組：

- `@react-native/metro-config`、`@react-native/metro-babel-transformer`、`@react-native/babel-preset`：皆為 0.88.1。Metro Config 是 Worklets 的必要 peer；App 使用 Expo 的 Metro，不需列入直接依賴。
- Babel 六項轉換器：`plugin-transform-arrow-functions`、`plugin-transform-react-jsx-self`、`plugin-transform-react-jsx-source`、`plugin-transform-shorthand-properties`、`plugin-transform-template-literals` 皆為 7.29.7；`plugin-transform-regenerator` 為 7.29.8。
- `flow-parser`、`flow-estree`：皆為 0.327.0，各在 Babel Preset 與 Metro Babel Transformer 下各一份，共四個節點。
- `@types/react-test-renderer` 19.3.1、`react-native-is-edge-to-edge` 1.3.1（後者為純 JavaScript 偵測工具）。

所有原有套件節點的版本保持不變，沒有移除套件；Expo、React、React Native、expo-sqlite、expo-sharing 與 expo-document-picker 都未升降版。未新增只供 Web 使用的 react-native-web。

## 修正前後驗證

先執行正常 `npm ci` 重現失敗，再修依賴；安裝層的回歸檢查就是同一個乾淨安裝指令，沒有為 lockfile 問題新增帳務或畫面測試。

為能在修正前執行 Expo 工具，先以 `npm install --package-lock=false --ignore-scripts` 暫裝，沒有改寫原 lockfile。所有 npm／Expo 快取、匯出與測試暫存均導向本 worktree。

| 檢查 | 修正前 | 修正後 |
| --- | --- | --- |
| npm ci | 退出碼 1；缺 react-dom、三個原生 peer、Metro／Babel／Flow 等節點 | 刪除 node_modules 後退出碼 0；安裝 517 個套件，未使用 legacy-peer-deps、force 或 ignore-scripts |
| npx expo install --check | 通過；Dependencies are up to date | 通過；Dependencies are up to date |
| npx expo-doctor | 20/20 通過 | 20/20 通過 |
| npm ls | React 因 react-dom 19.3.1 而 invalid，退出碼 1 | npm ls --all 退出碼 0，無無效或缺漏的必要 peer |
| npm test | 未在缺套件狀態執行 | 310/310 通過；失敗、略過、取消均為 0 |
| npm run typecheck | 未在缺套件狀態執行 | 通過，退出碼 0 |
| npx expo export --platform ios | 未在缺套件狀態執行 | 通過；1,229 個模組、23 個資產、1 個約 2.9 MB 的 Hermes bundle，輸出至忽略的 dist/ |

doctor 與版本檢查修正前就通過，不能單靠這兩項證明 lockfile 完整。實際修復證據是乾淨 `npm ci` 與完整依賴樹檢查。

測試使用既有合成資料與真 SQLite，`TMPDIR` 指向 `apps/mobile/.expo/lockfile-fix/tmp`，遵守不寫入 worktree 外檔案的限制；因此本次未觸發已知的 legacy-compare `/var` 與 `/private/var` 別名失敗，沒有修改該測試。

## 範圍與待確認

- 遷移版本：無新增，`src/ledger/migrations.ts` 未修改。`src/`、版面配置、帳務規則、SQLite 驅動與 schema 均未修改。
- 依 legacy-migration 規則核對影響：八項月結數字及交易／信用卡／投資總量的規則不變，預期影響為 0；合成 SQLite 回歸通過。未讀取 `.private` 或任何真實帳本，未執行或宣稱完成 58 個月私人資料驗收。
- `npm audit` 回報 5 項中度、0 項高度／嚴重弱點，位於既有 Expo CLI／Fingerprint 的 glob、minimatch 依賴鏈；相關版本與原 lockfile 相同。npm 建議的修正會將 Expo 改為 57.0.32，故本次未套用，留待 SDK 依賴維護另行處理。
- iOS export 驗證 JavaScript／資產打包，不代表 Xcode 原生編譯、簽章安裝或實機執行已通過。未執行 prebuild，沒有產生 ios/ 或 android/。

## 完成勾選

- [x] 修正前重現 npm ci 失敗
- [x] 執行 Expo 相容性檢查與 doctor，依 SDK 版本補齊必要 peer
- [x] 重產 lockfile，刪除 node_modules 後 npm ci 成功
- [x] 完成 310 個測試、型別檢查及 iOS 匯出
- [x] 記錄原生模組、doctor 前後結果及待驗事項
- [ ] iPhone 開發版原生編譯與下列實機操作（票 02 準備完成後）

## iPhone 實機步驟

1. 用更新後的 lockfile 重新建置並安裝開發版，冷啟動 App，確認沒有缺少原生模組或 Worklet 錯誤。
2. 切換五個分頁，進出記帳表單並測試返回手勢；新增、修改、刪除虛構交易，重開後確認資料正確。
3. 在設定開啟「備份與還原」，用測試帳匯出到「檔案」／iCloud Drive／AirDrop，再用選檔器還原；確認分享、選檔、取消及確認流程正常，還原後內容正確。

## Comments

2026-11-11 完成套件與 lockfile 修復及本機驗證；本次為獨立修復任務，完成勾選記於本報告，未將票 02／16 的實機項目誤標為完成。最終只異動 package.json、package-lock.json 與本報告；未提交、推送或建立 PR。

官方依據：[SDK 58](https://docs.expo.dev/versions/v58.0.0/)、[Router 安裝](https://docs.expo.dev/router/installation/)、[Drawer 必要依賴](https://docs.expo.dev/router/advanced/drawer/)、[SDK 58 Reanimated](https://docs.expo.dev/versions/v58.0.0/sdk/reanimated/)、[SDK 58 Gesture Handler](https://docs.expo.dev/versions/v58.0.0/sdk/gesture-handler/)。

## 追加（Claude，2026-11-11）

- 另以 `npx expo install expo-file-system` 正式加入 `expo-file-system ~58.0.13`（原生模組；原本就是 expo 的間接依賴）。票 15 CSV 選檔／匯出需要讀寫任意檔案位元組。加入後 `npm ci`、`npm test`、typecheck、expo-doctor 20/20 仍通過。
