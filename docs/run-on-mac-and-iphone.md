# 在 Mac 模擬器與自己的 iPhone 上跑 App（不需要付費開發者帳號）

給翰陞在自己的 Mac 上照做。這份說明是依 Expo 與 Apple 的公開文件寫的，**還沒有人在 Mac 上實際照跑過**；第一次照做時遇到的差異請回報，再回來修這份文件。

三種跑法，需要的帳號不同：

| 跑法 | 需要的帳號 | 限制 |
|---|---|---|
| Mac 上的 iPhone 模擬器 | 不需要 Apple 帳號 | 不是真手機；適合逐頁驗收畫面 |
| 裝到自己的 iPhone（Xcode 簽章） | 免費的 Apple ID | 每 7 天失效，要接回 Mac 重裝（資料會留著）；同時最多 3 個 App；不能含訂閱（內購） |
| TestFlight／正式上架 | Apple Developer Program（個人，US$99／年） | 無 |

## 前置（做一次）

1. 從 App Store 安裝 **Xcode**，打開一次讓它裝完 iOS 元件（含 iOS 模擬器）。
2. 安裝 **Node 24**（nodejs.org）。
3. 取得程式並安裝套件：

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

第一次會產生 iOS 專案並編譯，要十幾分鐘；之後會自動開模擬器並啟動 App。編譯產生的 `ios/` 資料夾不要提交到 Git。

**把舊帳放進模擬器：**

1. 從專案檔案區下載 `ledger-20261111.sqlite`（票 06 產出的正式帳本檔）。
2. 把檔案拖到模擬器視窗上，選擇存到「檔案」App（例如「我的 iPhone」底下）。
3. 在 App 裡走完第一次開啟的開帳畫面（選「從零開始」即可，之後會整本取代），到「設定」→「備份」→「匯入備份檔」，選剛才那個檔。
4. 匯入會整本取代，原本的帳會另存一份。

**逐頁驗收**：記帳（月曆、當天帳目、新增／修改／刪除）、明細（圓餅圖、類別列表）、預算、月結精靈（信用卡核對、總資產核對）、設定（帳戶、轉帳、CSV 匯入匯出、備份、提醒、貸款／分期、投資、調整）。看到的問題記下：哪一頁、做了什麼、預期與實際。

## 二、裝到自己的 iPhone（免費 Apple ID）

1. iPhone 用線接上 Mac，解鎖並按「信任這部電腦」。
2. iPhone：設定 → 隱私權與安全性 → **開發者模式** → 打開（會要求重新開機）。
3. Xcode → Settings → Accounts → 用你的 Apple ID 登入（會出現「Personal Team」）。
4. 執行：

   ```bash
   cd apps/mobile
   npx expo run:ios --device
   ```

   選你的 iPhone。第一次會問 App 的識別名稱（bundle identifier），必須是全世界唯一的字串；正式名稱還沒定之前先用暫時的，例如 `tw.<你的英文名>.ledger.dev`，之後可以改（改了等於另一個 App，資料要用備份檔搬）。
5. 若簽章失敗：用 Xcode 打開 `apps/mobile/ios/` 裡的 `.xcworkspace`，在 Signing & Capabilities 把 Team 選成你的 Personal Team，再重跑上面的指令。
6. 第一次開 App 前：iPhone 設定 → 一般 → VPN 與裝置管理 → 信任你的開發者 App。
7. 舊帳：把 `ledger-20261111.sqlite` 用 AirDrop 傳到 iPhone、存到「檔案」，再到 App 的「設定」→「備份」→「匯入備份檔」。

**訂閱（內購）**：免費 Apple ID 簽章的版本不能帶內購能力。目前程式還沒有接內購套件。要驗收月結精靈、貸款、投資等進階功能，執行指令前面加上 `EXPO_PUBLIC_IAP=off`（例如 `EXPO_PUBLIC_IAP=off npx expo run:ios --device`），這時是「開發版・未接內購」，進階功能全部開放，設定頁上方有黃色標示；不加就是免費版，可以看付費牆長什麼樣子。詳見 `docs/subscription.md`。

**7 天後** App 會打不開：接回 Mac 再跑一次第 4 步即可，資料不會消失。保險起見，每次重裝前先在 App 裡匯出一份備份檔。

## 什麼時候才需要付費帳號

- 要一個不會每週失效的安裝（建議在「新舊並行 2 個月」開始前）。
- 要建立真正的訂閱商品、用沙盒帳號測購買。
- 要用 TestFlight 或送審上架。

個人帳號審核通常要幾天，年費從開通那天起算。
