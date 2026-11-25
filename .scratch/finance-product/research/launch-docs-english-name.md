# 英文名稱候選報告（2026-11-12）

翰陞 2026-11-12 決定 App 名稱改用英文。核心目標：「幫忙管理個人財務」「清楚知道什麼可以花、什麼買不了」（後者已是副標題）。避開：Master／Advisor／Guru／Wealth／Invest、「最、唯一、保證」類字，以及任何近似現有記帳 App 的名稱。已同步附加到 [docs/app-store/app-name-candidates.md](../../../docs/app-store/app-name-candidates.md)。名稱不涉及價格；上架文字送 `tw-legal-tax-counsel` 審過後再交給翰陞。

**查證限制（與前次相同）**：查證日 2026-11-12，用網路搜尋 apps.apple.com，本環境無法使用 App Store 搜尋介面，搜尋引擎也不會逐一回傳台灣區頁面。「未查到」只代表網搜沒找到，**不等於 App Store 內確認沒有**。商標只能查到第三方彙整站（Justia 等），**無法查台灣智慧局**，皆為線索。定案前請翰陞在 iPhone（台灣帳號）App Store 搜尋名稱，並查智慧局商標檢索與 USPTO TESS。

### 候選與撞名結果

| # | 名稱（字元數） | 美國／台灣區 App Store | 商標線索 | 結論 |
|---|---|---|---|---|
| 1 | **Fullmonth**（9） | 未查到同名。近似：Fullness（個人理財 App，名稱不同）、iMonth（備忘 App） | 未查到 | 可用，待實機確認 |
| 2 | **Spendroom**（9） | 未查到同名。近似：Spendr、Spendlists、Spendful 等「Spend＋字尾」很多，辨識度中 | 未查到；同領域 Spendfully（YNAB 申請中）、Spendly（已註冊）字形相近 | 可用，注意近似 |
| 3 | **Afterbills**（10） | 未查到同名 | 有舊的 AFTERBILL.COM 美國商標紀錄（帳務／收款服務，[Justia](https://trademark.justia.com/758/61/afterbill-com-75861552.html)），可能已失效，待查 | 可用，商標待確認 |
| 4 | **Allotly**（7） | 未查到同名。近似：[Allowly（兒童零用錢）](https://apps.apple.com/app/id6762139161)、[Alotis](https://apps.apple.com/app/id1590967156) | 未查到 | 字形近似 Allowly，且 allot 台灣人不熟 |
| 5 | **Monthwell**（9） | 未查到 | 未查到 | 可用，語意偏弱 |
| 6 | **Roomful**（8） | 有 [Roomful Studio](https://apps.apple.com/us/app/roomful-studio/id1114016645)（3D 空間 App，非財務） | 未查到 | 語意偏「房間」，易誤解 |
| 7 | **Keepable**（8） | 未查到 | 有 KEEPABLE LLC 美國註冊（第 39 類儲運服務，[紀錄](https://markinton.com/trademark/keepable-97741557)），不同類別但已被註冊 | 不推薦 |
| 8 | **Spendable**（9） | **已被佔用**：[Spendable 預算 App，台灣區有頁面](https://apps.apple.com/tw/app/spendable-timely-bills/id6449970262)；另有 [Spendable - Managing Balance](https://apps.apple.com/us/app/-/id572236710) | — | 淘汰 |
| 9 | **Leftover**（8） | 無完全同名，但 What's Left Over?、[Left. Budget Planner](https://apps.apple.com/app/id6761345386)、[Surplus](https://apps.apple.com/app/id1578612881) 概念與名稱都近 | — | 淘汰（近似） |
| 10 | **CanSpend**（8） | [Can I Spend?](https://apps.apple.com/us/app/id6742256867) 預算 App，名稱近似 | — | 淘汰 |
| 11 | **Earmark**（7） | **已被佔用**：[Earmark: Budget Privately](https://apps.apple.com/mx/app/earmark-budget-privately/id6742861817)（本機預算 App，與本產品幾乎同類） | — | 淘汰 |
| 12 | **Monthend**（8） | 未查到 App，但 Monthend Apps 持有[會計軟體商標](https://trademark.justia.com/owners/monthend-apps-3916811) | 有 | 淘汰 |

另在初篩就淘汰：Headroom（多個同名 App）、SetAside（[Sinking Funds App](https://apps.apple.com/us/app/-/id6754886161) 同類）、Sparely（[儲蓄 App](https://apps.apple.com/app/id6773452595)）、Marginly（[預算 App](https://apps.apple.com/jm/app/marginly/id6759874703)）、Roomly（多個同名 App）、Cushion（有 AI 理財產品同名）。

### 評估（未淘汰者）

| 名稱 | 好記 | 契合核心目標 | 主畫面 | 中文商店名稱 | bundle id（定案前不要改 app.json） |
|---|---|---|---|---|---|
| Fullmonth | 高：Full＋Month，一眼懂「整個月都夠」 | 高：對應「月底有剩」「不當月光族」 | 9 字元，放得下 | 「Fullmonth－預算記帳」（13 字，上限 30） | `tw.<開發者代號>.fullmonth` |
| Spendroom | 中高：spend＋room（有空間花） | 高：直接對應「可以花多少」 | 9 字元 | 「Spendroom－預算記帳」 | `tw.<開發者代號>.spendroom` |
| Afterbills | 中高：付完帳單之後 | 中高：對應「先分好、剩多少」；但可能被當成帳單提醒 App | 10 字元 | 「Afterbills－預算記帳」 | `tw.<開發者代號>.afterbills` |
| Allotly | 中：allot＝分配 | 中：對應信封式分配，但字不常見 | 7 字元 | 「Allotly－預算記帳」 | `tw.<開發者代號>.allotly` |
| Monthwell | 中 | 中：語意模糊 | 9 字元 | 「Monthwell－預算記帳」 | `tw.<開發者代號>.monthwell` |

### 推薦前三名

1. **Fullmonth**：最直接對應「月底有餘、不當月光族」，同時暗示月結；字母好唸，台灣上班族看得懂；網搜未查到同名與商標。
2. **Spendroom**：最貼近翰陞的「清楚知道什麼可以花」（room to spend）；風險是「Spend＋字尾」命名擁擠，字形近 Spendfully／Spendly，須查商標。
3. **Afterbills**：講「帳單付完後還能花多少」，貼近預算先分好；風險是易被當成帳單提醒 App，且有舊商標紀錄待查。

備選：Allotly（若後兩者商標查出問題）。

### 需翰陞決定

- Q1 英文名稱選哪一個？建議：Fullmonth。
- Q2 定案前是否先在 iPhone App Store（台灣帳號）搜尋該名稱，並查智慧局商標檢索？建議：是，兩者都做；有問題改用 Spendroom。
- Q3 商店名稱格式？建議：「Fullmonth－預算記帳」，副標題「清楚知道什麼可以花，什麼買不了」。

## 2026-11-12 英文名稱法規審

審查角色：`tw-legal-tax-counsel`（AI，**非律師、非會計師**）。查證日 2026-11-12。**本節是風險篩查，不是商標檢索報告，也不是法律意見；定案前請翰陞自己查智慧局，並由商標代理人／律師確認。**

標記：【確定】官方明文；【推論】由明文或查得資料推得；【不確定】查不到或有爭議。

### 一、先講限制與結論總表

- 本環境**無法連到台灣智慧局（TIPO）商標檢索系統、USPTO 官方檢索、WIPO Global Brand Database**；以下商標資料來自網搜與第三方彙整站（Justia、Markinton、TrademarkDir 等），只能當線索。【確定】（網搜結果皆回報「查無該字」，但搜尋引擎未索引官方資料庫，查無不等於沒有。）
- 5 個名稱在網搜都**未查到完全相同的商標紀錄**。這是「沒查到」，不是「確認沒有」。【不確定】

| 名稱 | 風險等級 | 一句結論 |
|---|---|---|
| Fullmonth | 低至中（暫列低） | 商標線索乾淨、審查面無礙；語感「滿月」有些許歧義但不致誤解，須先過智慧局檢索。 |
| Spendroom | 中 | 同領域「Spend＋字尾」商標與 App 擁擠（含 YNAB 申請中的 Spendfully／Spendful），近似爭議機率最高。 |
| Afterbills | 中 | 美國舊商標已註銷，但「Bills」易被當成帳單繳費／提醒，且與 Afterpay 一類「After＋」金融品牌有聯想風險。 |
| Allotly | 中 | 與兒童零用錢 App Allowly 字形近、字義冷僻，商標雖未查到但識別與搜尋弱。 |
| Monthwell | 低 | 網搜未見相同或高度近似的財務類商標，風險低但語意弱、不易被記住。 |
| Roomful | 中 | 字太通用（Roomful 有同名 3D 空間 App），語意偏「房間」，在財務類別難建立識別。 |

排序建議：Fullmonth > Monthwell（商標面）> Spendroom／Afterbills／Allotly／Roomful。語意契合度行銷已評，不重複。

### 二、商標風險

#### 2.1 法律框架（台灣）

- 商標法第 30 條第 1 項第 10 款：相同或近似於他人註冊商標或申請在先之商標，而使用於**同一或類似**之商品或服務，有致相關消費者混淆誤認之虞者，不得註冊。【確定】出處：全國法規資料庫 https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=J0070001 （商標法第 30 條）。
- 商標法第 29 條第 1 項第 1 款：僅由描述商品或服務品質、用途等說明性文字構成者，不得註冊。【確定】同上。含意：太像一般字（Full Month＝整個月、Roomful＝滿屋）者，即使無人註冊，自己將來也難取得註冊或排他。【推論】
- 商標法第 68 條（侵害商標權）與第 70 條（擬制侵害）：未經同意於同一或類似商品／服務使用相同或近似商標，有混淆之虞，即可能侵權；註冊人可請求排除侵害與損害賠償。【確定】同上。【推論】即使翰陞沒有註冊，只要在台灣上架、使用的名稱與他人註冊商標近似且用於類似服務，就有被警告函或下架申訴的風險。
- 台灣採註冊保護與先申請原則，未註冊者保護有限（另有第 30 條第 1 項第 12 款對「明知他人商標存在」之搶註限制）。【推論】

#### 2.2 要查的類別（Nice 分類）

本 App 是**可下載的行動應用程式**，不提供金融服務。建議檢索範圍：

- **第 9 類**：可下載之應用軟體、行動應用程式（最核心）。
- **第 42 類**：軟體設計、非下載式軟體即服務（SaaS）。本 App 為本機運算，核心不在此，但同領域業者常一併註冊（例如 YNAB 的 Spendfully／Spendful 即登在第 42 類，見 https://trademarkdir.com/trademark/spendfully-98862258）。【推論】
- **第 36 類**：金融、保險、理財服務。本 App 不提供，但其他記帳／理財品牌常登記於此，**類似群組判斷時可能被認定與軟體相關**，須檢索以避免被他人註冊商標主張。【推論】
- 建議加查**第 35 類**（會計、記帳服務、商業管理）。【推論】

台灣審查看「類似商品／服務」，不是只看同類別，也可能跨類別（智慧局有類似群組代碼參考）。「類別不同就沒事」不成立。【推論】

#### 2.3 智慧局商標檢索：翰陞自己查的步驟

入口：經濟部智慧財產局官網（https://www.tipo.gov.tw）→「商標」→「商標檢索系統」（現行入口常見網址為 tmsearch.tipo.gov.tw，**以官網連結為準**【不確定：網址與選單名稱可能改版】）。依智慧局公開說明，系統有「文字近似檢索」「圖形近似檢索」「布林資料查詢」與 2024 年新增的以圖找圖，並提供商品服務名稱自動推薦（公開說明可見 https://www.tipo.gov.tw 公告與新聞稿，細節以系統內線上說明為準）。

1. 選「**文字近似檢索**」。
2. 輸入名稱，分別檢索：`Fullmonth`、`Full Month`、`Fullmoon`、`Full Moon`（音近）。其他候選照同法：`Spendroom`／`Spend Room`／`Spendrum`；`Afterbills`／`After Bill`／`Afterpay`；`Allotly`／`Allowly`／`Alotly`；`Monthwell`／`Month Well`；`Roomful`／`Room Full`。
3. 檢索範圍選「**商標名稱**」，包含「英文」；近似方式選「**全部（含相似）**」或系統提供的近似度選項（字首、字尾、音近、字形近）。
4. 限縮類別：商品／服務分別選**第 9、35、36、42 類**（可直接以類別號碼或用自動推薦輸入「應用程式軟體」「記帳軟體」「預算管理軟體」）；第一輪**不限縮類別**先看全貌，再逐類看。
5. 看每筆結果的：**申請人、商標狀態（註冊／審查中／已消滅）、指定類別與商品服務內容、申請日（先於你者才構成障礙）**。
6. 發現近似者，記下商標號碼、申請人、類別、狀態，留給商標代理人判斷。
7. 另查：**USPTO**（https://tmsearch.uspto.gov，美國商標檢索）、**WIPO Global Brand Database**（https://branddb.wipo.int/，可一次查多國，含台灣）。【確定：為公開官方資料庫；是否涵蓋台灣最新資料需自行確認。】
8. 再到台灣區與美國區 App Store 實機搜尋，並查網域與公司登記名稱（經濟部商工登記 https://findbiz.nat.gov.tw）。

#### 2.4 逐名稱線索

**Fullmonth**
- 網搜 USPTO 相關資料：**未查到 FULLMONTH／FULL MONTH**；只出現 FULL MONTY（已失效）、FULL MONTI（新申請，未審）等不近似字。【推論：不構成近似】來源 https://markinton.com/trademark/full-monty-88924087 、https://trademarks.justia.com/998/32/full-99832499.html 。
- 風險點：Full＋Month 為通用字組合，第 29 條第 1 項第 1 款描述性疑慮低（用於記帳軟體並非直接描述），但**排他力弱**，後來者近似字多。【推論】
- 【不確定】台灣、WIPO 資料無法查證。

**Spendroom**
- 網搜未查到 SPENDROOM。【推論】
- 近似線索：SPENDFULLY（You Need A Budget LLC，申請中，第 42 類）、SPENDFUL（同申請人）、SPENDLIMIT、SPENDIFY（Spendify Money LLC，個人財務管理 App，申請中）。來源 https://trademarkdir.com/trademark/spendfully-98862258 、https://markinton.com/trademark/spendful-98861803 、https://markinton.com/trademark/spendlimit-99286432 、https://trademarkdir.com/trademark/spendify-99444355 。【確定：紀錄存在（第三方彙整）】
- 推論：同領域多人以「Spend＋」起名，註冊人未必擴張到台灣；但 YNAB 是國際品牌，若日後在台申請，Spendroom 的近似爭議機率高於其他候選。【推論】

**Afterbills**
- AFTERBILL.COM 美國商標：申請 1999-12-01，**狀態 710 已註銷（Section 8 未維持），狀態日 2008-11-21**。來源 https://trademark.justia.com/758/61/afterbill-com-75861552.html 。【確定（第三方彙整）】→ 原報告「可能已失效」可更新為「已註銷」，不構成美國現行障礙。
- 聯想風險：Afterpay（先買後付，全球知名金融服務品牌）屬「After＋」結構，Afterbills 在字形與語感上可能被聯想為帳單／分期付款服務。【推論：來自一般市場常識，本次未檢索 Afterpay 商標資料，【不確定】是否構成近似；請在檢索時一併查 AFTERPAY 在台灣的註冊類別。】

**Allotly**
- 網搜未查到 ALLOTLY 商標。【推論】
- 近似 App：Allowly（兒童零用錢，https://apps.apple.com/app/id6762139161）、Alotis。字形近、使用情境（零用錢分配）亦近，**消費者混淆之虞有一定可能**。【推論】

**Monthwell**
- 網搜未查到 MONTHWELL。相近但不同：MOUNTWELL（申請中，未審）、MONTWELL（第 12 類車輛）、MOMWELL（第 3 類化妝品）、MONIWELL（已註冊，領域待查）。來源 https://trademarks.justia.com/993/87/mountwell-99387589.html 、https://markinton.com/trademark/montwell-97892251 。【推論：類別或字形差異，尚不構成明顯障礙；MONIWELL 的指定商品未核實，需檢索時確認】

**Roomful**
- 網搜未查到 ROOMFUL 商標；有 Roomful Studio App（3D 空間，非財務）。同時有 ROOM（PAX Technology，第 9、36 類）、ROOM ZERO（第 9、36、42、35 類，含財務軟體）等 ROOM 系列。來源 https://markinton.com/trademark/room-90132899 、https://markinton.com/trademark/room-zero-79410388 。【確定：紀錄存在（第三方）；推論：Roomful 含 ROOM，須檢視是否被「ROOM」類既有商標主張近似，一般風險不高但識別弱。】

### 三、Apple 審查面

#### 3.1 名稱格式「英文名稱＋－＋中文後綴」

- 規範：2.3.7「App names must be limited to 30 characters」；不得在名稱中塞入商標字、熱門 App 名稱、價格資訊或無關詞彙以操弄搜尋；副標題不得提及其他 App 或做無法驗證的主張。【確定】出處 https://developer.apple.com/app-store/review/guidelines/ 第 2.3.7。App Store Connect 說明：名稱 2 至 30 字元。【確定】出處 https://developer.apple.com/help/app-store-connect/reference/app-information/ 。
- 「Fullmonth－預算記帳」共 13 字（原報告已算），遠低於上限。「預算記帳」是對功能的準確描述，不是商標字、價格或他牌名稱。【推論：符合 2.3.7；Apple 對「名稱附帶描述字」未明文禁止，常見於記帳類 App，但審查員有裁量權。】【不確定：Apple 可能要求把描述移到副標題。】
- 建議：名稱欄只放品牌＋單一描述詞，不再疊加「理財、投資、省錢、最強」等字；副標題寫功能，不寫「最」「唯一」「保證」。【推論】
- 全形破折號「－」可用，但建議測試 App Store Connect 顯示；若顯示異常改用半形「-」或「：」。【不確定】

#### 3.2 名稱是否暗示金融服務／投資建議（3.2.1(viii)、5.1.1(ix)）

- 3.2.1(viii)：用於「financial trading, investing, or money management」的 App，應由提供該服務的金融機構提交，並具備所需授權。【確定】5.1.1(ix)：高度管制領域（含 banking and financial services）的 App 應由法人而非個人開發者提交。【確定】出處同 https://developer.apple.com/app-store/review/guidelines/ 。
- 推論：**觸發這兩條的是 App 的功能與描述，不是英文名稱本身**；Apple 的規則並未規範名稱字根。但審查員讀的是名稱、副標題、描述的整體印象，因此名稱不宜出現 invest、wealth、advisor、bank、pay、loan、fund、trade 等金融服務字樣。【推論】
- 逐名稱：
  - Fullmonth、Monthwell：未含金融服務字根，**無暗示**。
  - Spendroom：「spend」指花費，不是服務，但可能被理解為花錢／消費工具；低。
  - **Afterbills：「Bills」可聯想帳單繳付／帳單提醒（bill pay）**，審查員可能追問是否代為付款；本 App 不付款，須在審查備註寫清「不繳帳單、不轉帳」。中。
  - Allotly：「allot」＝分配，指預算分配；低，但審查員可能以為是資金分配（allocation）；備註已涵蓋。
  - Roomful：無金融字根，但名稱與功能無關，審查員可能質疑名稱的相關性（2.3.7「不相關」較偏 metadata 而非名稱）；低。
- 與票 17 的關係：翰陞已決定個人身分註冊，若被要求法人則設立有限公司。**名稱選擇不改變這個風險**；但「預算記帳」後綴＋副標題中的「什麼可以花」已是較保守的描述。審查備註沿用票 17 Q2 即可。【推論】

#### 3.3 商標與 Apple 流程

- 5.2.1：不得未經許可使用第三方商標；亦不得含「誤導或仿冒」的名稱。【確定】
- Apple 開發者論壇有案例：他人主張名稱近似時，Apple 可能要求更名或下架（論壇為軼事，非官方規則）。【不確定】
- 實務：名稱欄在 App Store Connect 保留名稱時，Apple 僅檢查**同店面內是否有同名 App**，不檢查商標。【不確定：Apple 官方說明為名稱須唯一，未明文說明商標審查範圍，以 App Store Connect 提示為準。】

### 四、台灣華語語感風險

| 名稱 | 語感觀察 | 風險 |
|---|---|---|
| Fullmonth | 台灣人多半會拆讀 full＋month，意為「整個月」；對應「月底夠用」是正向聯想。華語裡「滿月」除「望月」外，**常指嬰兒出生滿一個月的「滿月酒／彌月」**，Fullmonth 字面近「滿月」，部分使用者可能產生「滿月＝育兒／彌月」聯想，也可能因英文並非 full moon 而不構成誤解。【推論：非查證結果；建議用 5 至 10 位身邊使用者做 5 秒測試，問「看到這名字你覺得是什麼 App」。】另：搜尋「滿月」不會找到 Fullmonth，建議以關鍵字欄補「月結」「預算」，不放名稱。 | 低至中 |
| Spendroom | 讀音易聽成「spend room」；「花錢的房間」略怪，部分人會覺得鼓勵花費，與「不當月光族」定位微衝突。 | 低至中 |
| Afterbills | 「帳單之後」好理解；但「bills」在台灣常讓人想到繳費／帳單提醒（水電、信用卡帳單），可能吸引找繳費 App 的人，造成評價落差。 | 中 |
| Allotly | allot 字不常見，台灣多數使用者看不懂、不好讀，易被打成 Allowly。 | 中 |
| Monthwell | well 在華語常聯想「健康」（wellness），可能被當成健康／習慣 App。 | 低至中 |
| Roomful | 「滿屋子」，在台灣易聯想居家、租屋、室內設計。 | 中 |

### 五、需專業人士確認的問題（可直接拿去問商標代理人或律師）

1. 請就 Fullmonth（及 Full Month、Fullmoon）在台灣第 9、35、36、42 類及類似群組做近似檢索，是否有申請在先、可能構成商標法第 30 條第 1 項第 10 款的近似商標？
2. 本 App 若僅以個人身分在台灣店面使用此名稱，未註冊商標，被他人主張侵權的風險與處理流程？個人可否申請商標，之後若設立有限公司，如何移轉？
3. Fullmonth 是否有商標法第 29 條第 1 項第 1 款描述性疑慮；建議申請的指定商品／服務與類別（第 9 類為主，是否加第 42、35 類）？
4. YNAB 在美國申請的 SPENDFULLY／SPENDFUL（第 42 類）若擴張至台灣，是否可能與 Spendroom 構成近似？（僅在翰陞選 Spendroom 時才需問。）
5. AFTERPAY 在台灣的註冊類別與 Afterbills 是否有混淆誤認之虞？（僅在選 Afterbills 時才需問。）
6. Apple 實務上，個人賣家若被主張商標侵權，Apple 的下架流程與申訴期限是什麼？
7. 名稱出現在 App Store 與主畫面，是否需要先申請商標再上架？成本（申請規費以智慧局公告為準）與時程？

### 六、行動建議

- 主選 **Fullmonth**，上架前依序做：①翰陞在 iPhone（台灣帳號）搜尋 ②智慧局文字近似檢索（第 2.3 節步驟）③WIPO Global Brand Database 與 USPTO ④5 至 10 人語感測試 ⑤有疑慮再請商標代理人確認。
- 備選依序 **Monthwell**（商標面最乾淨）、**Spendroom**（若要保留「可以花」語意，但要先查 Spendfully／Spendify 近似）。
- 不建議 Afterbills（Bills 聯想繳費）與 Roomful（語意偏房間）；Allotly 僅在簡短好記不是第一優先時考慮。
- 商店名稱沿用「Fullmonth－預算記帳」；名稱、副標題避免 invest／wealth／advisor／pay／bank，保留審查備註（票 17 Q2）原文。

**免責**：以上為 AI 的風險篩查，**不是律師意見**，亦非商標檢索結果；網搜來源多為第三方彙整站。上線前請商標代理人／律師確認，並以智慧局、USPTO、WIPO 官方資料庫為準。
