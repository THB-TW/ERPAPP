# 在 Mac 模擬器與自己的 iPhone 上跑 App（不需要付費開發者帳號）

給翰陞在自己的 Mac 上照做。模擬器部分已在 2026-11-11 於翰陞的 Mac（Xcode 26.6、iPhone 17 模擬器、iOS 26.5）實際照跑過並修正；實機部分還沒照跑過，遇到差異請回報。

三種跑法，需要的帳號不同：

| 跑法 | 需要的帳號 | 限制 |
|---|---|---|
| Mac 上的 iPhone 模擬器 | 不需要 Apple 帳號 | 不是真手機；適合逐頁驗收畫面 |
| 裝到自己的 iPhone（Xcode 簽章） | 免費的 Apple ID | 每 7 天失效，要接回 Mac 重裝（資料會留著）；同時最多 3 個 App；不能含訂閱（內購） |
| TestFlight／正式上架 | Apple Developer Program（個人，US$99／年） | 無 |

## 前置（做一次）

1. 從 App Store 安裝 **Xcode**，打開一次讓它裝完 iOS 元件（含 iOS 模擬器）。
2. 安裝 **Node 24**（nodejs.org）與 **CocoaPods**（`brew install cocoapods`）。
3. 確認終端機的語系是 UTF-8（`echo $LANG` 要看到 `…UTF-8`）。若是空的，CocoaPods 會在路徑含中文時當掉（`Unicode Normalization not appropriate for ASCII-8BIT`），先執行：

   ```bash
   export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8
   ```
4. 取得程式並安裝套件：

   ```bash
   git clone https://github.com/THB-TW/ERPAPP.git ERPAPP   # 已經有就 git pull
   cd ERPAPP
   git checkout claude/project-thread-xdtlp5               # 合併之後改用預設分支
   cd apps/mobile
   npm ci
   ```

## 一、Mac 上的 iPhone 模擬器

```bash
cd apps/mobile
npx expo run:ios
```

第一次會產生 iOS 專案並編譯，要十幾分鐘；之後會自動開模擬器並啟動 App。編譯產生的 `ios/` 資料夾已在 `.gitignore`，不會進 Git。

- 若最後出現 `simctl openurl … Operation timed out`：這是剛開機的模擬器反應太慢，App 其實已經裝好。另開一個終端機執行 `npx expo start`，再在模擬器桌面點「記帳」圖示開啟即可。之後改程式只要 `npx expo start`，不必重新編譯。
- **要驗收月結、貸款、投資等進階功能**：目前還沒接內購，指令前面要加 `EXPO_PUBLIC_IAP=off`（`EXPO_PUBLIC_IAP=off npx expo run:ios`，或之後的 `EXPO_PUBLIC_IAP=off npx expo start`）。設定頁上方出現黃色「開發版・未接內購」就對了；不加是免費版，按進月結會出付費牆。
- App 暫定的識別名稱是 `tw.thbtw.ledger.dev`、顯示名稱 Afterbills（2026-11-12 定案）；識別名稱等申請開發者帳號時再定。

**把舊帳放進模擬器：**

1. 從專案檔案區下載 `ledger-20261111.sqlite`（票 06 產出的正式帳本檔）。
2. 把檔案拖到模擬器視窗上，選擇存到「檔案」App 的「我的 iPhone」底下。
3. 全新安裝的 App 會先進開帳畫面。**不要完成開帳**（開帳後再匯入舊帳會被拒），直接按最下面的「已有備份檔？還原帳本」→「匯入備份檔」→「瀏覽」→「我的 iPhone」→ 選剛才那個檔 →「取代」。
4. 看到綠字「已匯入備份，整本帳已取代」後按左上「返回」，就會進到記帳月曆。

**逐頁驗收**：記帳（月曆、當天帳目、新增／修改／刪除）、明細（圓餅圖、類別列表）、預算、月結精靈（信用卡核對、總資產核對）、設定（帳戶、轉帳、CSV 匯入匯出、備份、提醒、貸款／分期、投資、調整）。看到的問題記下：哪一頁、做了什麼、預期與實際。

## 二、裝到自己的 iPhone（免費 Apple ID）

1. iPhone 用線接上 Mac，解鎖並按「信任這部電腦」。
2. iPhone：設定 → 隱私權與安全性 → **開發者模式** → 打開（會要求重新開機）。
3. Xcode → Settings → Accounts → 用你的 Apple ID 登入（會出現「Personal Team」）。
4. 在 **Mac 的「終端機」App** 執行（不是在 iPhone 上；手機只要開好開發者模式、用線接著）。先進到 repo 資料夾（例如 `~/Documents/Account_app`，也就是看得到 `apps` 的那一層），確認在整合分支：

   ```bash
   cd ~/Documents/Account_app            # 換成你放 repo 的資料夾
   git checkout claude/project-thread-xdtlp5
   git pull
   cd apps/mobile
   npm ci
   npx expo run:ios --device
   ```

   若 `cd apps/mobile` 找不到，代表不在 repo 根目錄或分支不對：用 `pwd`、`ls`、`git branch --show-current` 檢查。

   選你的 iPhone。App 的識別名稱（bundle identifier）已在 `app.json` 設為暫定的 `tw.thbtw.ledger.dev`；之後改名等於另一個 App，資料要用備份檔搬。
5. 若簽章失敗：用 Xcode 打開 `apps/mobile/ios/` 裡的 `.xcworkspace`，在 Signing & Capabilities 把 Team 選成你的 Personal Team，再重跑上面的指令。
6. 第一次開 App 前：iPhone 設定 → 一般 → VPN 與裝置管理 → 信任你的開發者 App。
7. 舊帳：把 `ledger-20261111.sqlite` 用 AirDrop 傳到 iPhone、存到「檔案」，第一次開 App 時在開帳畫面按「已有備份檔？還原帳本」匯入（不要先完成開帳）。

**訂閱（內購）**：免費 Apple ID 簽章的版本不能帶內購能力。目前程式還沒有接內購套件。要驗收月結精靈、貸款、投資等進階功能，執行指令前面加上 `EXPO_PUBLIC_IAP=off`（例如 `EXPO_PUBLIC_IAP=off npx expo run:ios --device`），這時是「開發版・未接內購」，進階功能全部開放，設定頁上方有黃色標示；不加就是免費版，可以看付費牆長什麼樣子。詳見 `docs/subscription.md`。

**7 天後** App 會打不開：接回 Mac 再跑一次第 4 步即可，資料不會消失。保險起見，每次重裝前先在 App 裡匯出一份備份檔。

## 什麼時候才需要付費帳號

- 要一個不會每週失效的安裝（建議在「新舊並行 2 個月」開始前）。
- 要建立真正的訂閱商品、用沙盒帳號測購買。
- 要用 TestFlight 或送審上架。

個人帳號審核通常要幾天，年費從開通那天起算。
