// 付費牆文字：採 .scratch/finance-product/research/08-subscription-legal-review.md 第 7 節修訂版，
// 2026-11 加入「預算資料匯出」（PR #25 定案為付費）。價格一律由 StoreKit displayPrice 帶入，不寫死金額。
// 改動這裡的文字要先給 tw-legal-tax-counsel 審。

export const APP_DISPLAY_NAME = '本 App'; // 正式名稱未定（票 02），定案後替換。
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export interface PaywallPrices { monthly: string; yearly: string }

export interface PaywallSection { heading?: string; lines: string[] }

export function paywallSections(prices: PaywallPrices, trialEligible: boolean): PaywallSection[] {
  const intro: PaywallSection = {
    lines: [
      `訂閱後可使用：月結精靈（信用卡核對、總資產核對）、月結後累積的預算儲備、貸款／分期、投資紀錄、預算資料匯出，以及這些功能的月結與繳款提醒。記帳、圓餅圖、預算上限、交易 CSV 匯入與匯出、備份等免費功能不受影響。`,
    ],
  };
  const pricing: PaywallSection[] = trialEligible
    ? [
      {
        heading: '免費試用 3 個月',
        lines: [
          '試用期間不收費。試用結束後，將以你選擇的方案自動開始計費並持續續訂，直到你取消為止：',
          `年方案：每年 ${prices.yearly}`,
          `月方案：每月 ${prices.monthly}`,
          '每個 Apple 帳號限試用一次。',
        ],
      },
      { heading: '付款', lines: ['訂閱透過你的 Apple 帳號處理。試用結束時才會首次扣款；續訂款項可能於目前期間結束前 24 小時內扣款。'] },
    ]
    : [
      {
        heading: '訂閱費用',
        lines: [
          `年方案：每年 ${prices.yearly}`,
          `月方案：每月 ${prices.monthly}`,
          '確認訂閱時，將透過你的 Apple 帳號首次扣款，之後每個期間自動續訂並扣款，直到你取消為止；續訂款項可能於目前期間結束前 24 小時內扣款。',
        ],
      },
    ];
  return [
    intro,
    ...pricing,
    {
      heading: '取消',
      lines: ['如不想續訂，請至少於目前期間（含試用期間）結束前 24 小時，到 iPhone「設定」點選你的姓名 >「訂閱項目」，選擇本 App 並關閉自動續訂（或按下方「管理訂閱」）。取消後可使用到目前期間結束為止。刪除 App 不會取消訂閱。'],
    },
    {
      heading: '訂閱到期或取消後',
      lines: ['免費功能照常使用；已建立的月結、儲備、貸款／分期與投資紀錄會保留在你的手機中，可檢視但無法新增或修改；預算資料匯出會停用，交易 CSV 匯出與備份仍可使用（備份檔包含全部預算資料）。資料存放在你的手機，刪除 App 或更換手機前請先備份。'],
    },
    { lines: ['退款申請依 Apple 規定與台灣相關法令辦理。'] },
  ];
}

export function purchaseButtonLabel(trialEligible: boolean, period: 'month' | 'year', price: string): string {
  const plan = period === 'year' ? `年方案 ${price}／年` : `月方案 ${price}／月`;
  return trialEligible ? `開始免費試用（${plan}）` : `訂閱${plan}`;
}
