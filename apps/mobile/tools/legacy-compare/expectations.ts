// 比對工具對「真實舊帳基準」的預期值（不是從來源算出來的，是人已經知道的事實；來源算出來的數字跟它不同就算門檻差異）。
// 轉換程式的基準身分（58 個月、7,033 筆…）在 ../legacy-convert/baseline.ts；這裡只放比對工具自己多釘的數字。
// 只有程式介面（測試）能傳入別的預期值；命令列沒有旗標。
export interface CompareExpectations {
  /**
   * 財務文件記有「非 0 歷史總資產差異」的月份數（舊系統帳面總資產與三項分項合計對不起來的月份，2026-11-08 基準是 17 個月）。
   * 注意這和基準身分的「歷史資產差異 0」是兩回事：後者是舊資料表（dbo.Property）與財務文件逐月不符的月數，
   * 前者是文件裡 LegacyTotalDifference 不為 0 的月份數。
   */
  legacyDifferenceMonths: number;
}

export const COMPARE_EXPECTATIONS_20261108: CompareExpectations = { legacyDifferenceMonths: 17 };
