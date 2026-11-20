// 貸款的純計算；資料查詢與每月快照保存由帳本服務負責。
import { BudgetRuleError } from './budgetEngine.ts';

export function addLoanAmounts(a: number, b: number): number {
  const value = a + b;
  if (!Number.isSafeInteger(value)) throw new BudgetRuleError('overflow', '金額超出可安全計算的範圍，已拒絕。');
  return value;
}

export function calculateLoanReserve(loan: { name: string; monthlyPayment: number; remainingPrincipal: number | null; reserve: number }, payment: number) {
  const contribution = loan.remainingPrincipal === null ? loan.monthlyPayment : Math.min(loan.monthlyPayment, loan.remainingPrincipal);
  if (loan.remainingPrincipal !== null && payment > loan.remainingPrincipal) {
    throw new BudgetRuleError('operation', `貸款「${loan.name}」的繳款超過剩餘本金，請先核對交易或貸款設定。`);
  }
  return { contribution, payment, reserve: addLoanAmounts(addLoanAmounts(loan.reserve, contribution), -payment),
    remainingPrincipal: loan.remainingPrincipal === null ? null : loan.remainingPrincipal - payment };
}
