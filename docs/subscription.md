# 訂閱與付費牆（票 22）

規格：`.scratch/finance-product/spec.md`「訂閱與權益」。票：`.scratch/finance-app/issues/22-subscription.md`。

## 分層

| 層 | 檔案 | 說明 |
|---|---|---|
| 權益純規則 | `apps/mobile/src/subscription/entitlement.ts` | 從 App Store 有效交易算出權益紀錄；試用、寬限期視為有效；撤銷／退款立即到期；離線用上次確認的到期時間。App 不自己計試用時間。 |
| 訂閱服務 | `src/subscription/subscriptionService.ts` | 組合購買介面＋權益紀錄儲存區＋時鐘；啟動就監聽交易更新、到期那一刻自動降級並通知畫面。 |
| 購買介面邊界 | `src/subscription/storePort.ts` | `StorePort`：讀方案與試用資格、目前權益、購買、還原、交易更新。目前只有 `unavailableStore`。 |
| 手機接線 | `src/platform/appSubscription.ts` | 權益紀錄存在 `expo-sqlite/kv-store` 的獨立資料庫（不是 `ledger.db`，不進備份檔）；建置開關在這裡。 |
| 畫面 | `src/ui/closeEntitlement.ts`、`src/ui/PaidLock.tsx`、`src/app/paywall.tsx`、`src/app/subscription.tsx` | `requirePaidFeature()` 沒權益就推付費牆；`useHasPaidAccess()` 讓畫面隨權益變動重繪。 |
| 文字 | `src/subscription/paywallText.ts`、`statusText.ts` | 付費牆採法規審核修訂版；改字要先給 `tw-legal-tax-counsel` 審。 |

帳本服務不認識訂閱，只吃每個指令的 `hasEntitlement`（規格「權益不進帳本服務」）；權益對帳本指令的影響已有測試（`src/ledger/*.test.ts` 裡 `hasEntitlement: false` 的案例，含到期後預算上限仍可改）。

## 付費牆時機與到期行為

- 從沒訂閱過：按「進入信用卡帳單核對」（開始月結）、預算資料匯出，或在唯讀頁按「查看進階版方案」才出付費牆。開帳全免費。
- 試用：使用者在付費牆按「開始免費試用」後由 Apple 起算（introductory offer），App 不計時；試用資格由 StoreKit 判斷，決定付費牆用版本 A（有試用）或 B。
- 到期：月結、調整、貸款、投資變唯讀並出現「重新訂閱」；預算上限仍可改；交易 CSV 與備份照常；預算資料匯出鎖住；付費提醒在權益變動時自動取消。重新訂閱後月結精靈從最早的開放月份依序補做。

## 建置開關：沒有內購的版本

- `EXPO_PUBLIC_IAP=off`：不接內購（免費 Apple ID 自簽裝機用，因為這種簽章不能帶內購能力），狀態是 `dev_unlocked`：進階功能全開，設定頁與月結頁標示「開發版・未接內購」。這不綁任何 Apple ID；自簽版本也無法散布。（2026-11-11 翰陞定案：開發版付費功能全開。）
- **必須明確設定才會全開**。沒設定而內購又不可用（例如還沒有轉接層、原生模組載入失敗）時一律當作免費版，付費功能鎖住，不會誤送給所有人。
- 目前還沒有 StoreKit 轉接層，所以現在跑模擬器或裝機要驗收月結等功能，請加上 `EXPO_PUBLIC_IAP=off`，例如 `EXPO_PUBLIC_IAP=off npx expo run:ios`。不加就會看到免費版（可用來驗收付費牆）。
- 上架前檢查：正式建置（之後的 EAS production 設定）**不得**設定 `EXPO_PUBLIC_IAP=off`（`subscription.test.ts` 會檢查 eas.json），且必須有 StoreKit 轉接層；設定頁不應出現黃色開發版標示。
- 其他防護：權益紀錄存在帳本之外；手機時間調回上次確認之前不會延長離線權益；回前景會重新確認，休眠中到期回來第一次讀就降級；本來有效卻查到空結果會再確認一次才降級。

## Xcode 本機 StoreKit 測試

`apps/mobile/storekit/Premium.storekit`：同一訂閱群組 `premium` 的 `premium_yearly`（690）與 `premium_monthly`（90），都掛 3 個月免費試用、家人共享關閉；店面台灣。測試 `subscription.test.ts` 會檢查它和程式的商品代號一致。**還沒在 Xcode 開過**，第一次打開若格式需要更新，讓 Xcode 存檔即可。

使用方式（接上轉接層之後）：`npx expo run:ios` 產生 `ios/` 後，用 Xcode 打開 `.xcworkspace` → Product › Scheme › Edit Scheme › Run › Options › StoreKit Configuration 選 `Premium.storekit`，再從 Xcode 執行。Debug › StoreKit › Manage Transactions 可以讓訂閱到期、退款、進入寬限期（Editor › Enable Billing Grace Period），不需要付費開發者帳號，模擬器即可。

## 還沒做（要付費開發者帳號或翰陞決定）

1. **選內購套件並寫 StoreKit 2 轉接層**（實作 `StorePort`）。新增原生套件要翰陞同意；候選見 PR 說明。
2. 在 App Store Connect 建商品、試用、開帳單寬限期（翰陞）。
3. 沙盒實測：訂閱、試用、續訂、到期、寬限期、還原購買。
4. 隱私權政策網址（付費牆目前顯示「上架前提供」）、App 正式名稱（付費牆暫用「本 App」）。

## 審核紀錄（2026-11-11）

- `tw-legal-tax-counsel`：付費功能加「預算資料匯出」、改寫「交易 CSV」、到期段的匯出說明皆可用；已依意見修正設定頁到期句、已關閉自動續訂時不再寫「會自動續訂」、付費牆價格字級不小於試用標題（3.1.2(c)）。上架前必補：可點的隱私權政策連結（付費牆與 App Store Connect）、App Store 描述加 EULA 連結、正式 App 名稱；「含稅價」與退款句仍待會計師／律師。開發版狀態不得出現在正式建置（3.1.1）。非律師意見，上架前請專業人士確認。
- `subscription-iap`：已修正——開發版全開改為必須明確設定 `EXPO_PUBLIC_IAP=off`；讀狀態時重新判斷到期、回前景重新確認；手機時間回撥不延長權益；空結果先再確認；付費畫面改用會隨權益重繪的判斷；StoreKit 設定檔補寬限期等測試開關。轉接層約定寫在 `storePort.ts`（寬限期到期日取自 SubscriptionInfo.status 的 renewalInfo、只收驗證過的交易、家人共享略過）。套件建議 expo-iap，但沒有來源證實已支援 Expo SDK 58，要先查證再實測。
