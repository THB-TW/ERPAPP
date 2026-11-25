// 設定 › 訂閱 顯示的狀態說明（純函式，可測）。
import { PRODUCT_IDS, type SubscriptionStatus } from './entitlement.ts';

const dateText = (iso: string) => new Date(iso).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });
const planText = (id: string) => (id === PRODUCT_IDS.yearly ? '年方案' : '月方案');

export function subscriptionSummary(status: SubscriptionStatus): string {
  switch (status.kind) {
    case 'dev_unlocked': return '開發版：這個版本沒有接上 App Store 內購，進階功能全部開放。上架版本不會有這個狀態。';
    case 'never': return '目前使用免費版。記帳、圓餅圖、預算上限、交易 CSV 與備份永久免費。';
    case 'active':
      if (status.inGrace) return `${planText(status.productId)}：扣款未成功，帳單寬限期內照常使用到 ${dateText(status.activeUntil)}。請到 Apple 帳號更新付款方式。`;
      if (!status.willAutoRenew) return `${planText(status.productId)}：已關閉自動續訂，不會再扣款，可使用到 ${dateText(status.activeUntil)}。`;
      if (status.isTrial) return `${planText(status.productId)}：免費試用中，試用到 ${dateText(status.activeUntil)}；之後會自動以此方案計費，除非你在到期前 24 小時以上取消。`;
      return `${planText(status.productId)}：有效，目前期間到 ${dateText(status.activeUntil)}，之後會自動續訂。`;
    case 'expired': return `${planText(status.productId)}已於 ${dateText(status.endedAt)} 到期。月結、儲備、貸款與投資紀錄仍保留且可檢視；預算資料匯出已停用，交易 CSV 匯出與備份（含全部預算資料）照常可用。`;
  }
}

