// 票 22：訂閱權益規則與訂閱服務。用假的 App Store 與記憶體儲存，不需要 Apple 帳號。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRODUCT_IDS, evaluateStatus, gateAction, hasPaidAccess, parseRecord, reconcileRecord, recordFromStore,
  type StoreEntitlement,
} from './entitlement.ts';
import { createSubscriptionService, type RecordStorage } from './subscriptionService.ts';
import { StoreUnavailableError, unavailableStore, type StorePort } from './storePort.ts';

const NOW = new Date('2026-12-01T00:00:00Z');
const at = (iso: string) => new Date(iso);

function row(fields: Partial<StoreEntitlement> = {}): StoreEntitlement {
  return { productId: PRODUCT_IDS.monthly, expiresAt: '2027-03-01T00:00:00Z', isTrial: true, graceUntil: null, revokedAt: null, willAutoRenew: true, ...fields };
}

test('從沒訂閱過：碰付費功能出付費牆，帳本指令沒有權益', () => {
  const status = evaluateStatus(null, NOW);
  assert.deepEqual(status, { kind: 'never' });
  assert.equal(hasPaidAccess(status), false);
  assert.equal(gateAction(status), 'paywall');
});

test('試用中視為有效；試用時間完全來自 App Store，到期後轉唯讀並改顯示重新訂閱', () => {
  const record = recordFromStore([row()], NOW);
  assert.ok(record);
  const trial = evaluateStatus(record, NOW);
  assert.equal(trial.kind, 'active');
  assert.equal(trial.kind === 'active' && trial.isTrial, true);
  assert.equal(gateAction(trial), 'allow');
  const after = evaluateStatus(record, at('2027-03-01T00:00:01Z'));
  assert.deepEqual(after, { kind: 'expired', productId: PRODUCT_IDS.monthly, endedAt: '2027-03-01T00:00:00Z' });
  assert.equal(hasPaidAccess(after), false);
  assert.equal(gateAction(after), 'resubscribe');
});

test('帳單寬限期間不降級，寬限期結束才到期', () => {
  const record = recordFromStore([row({ expiresAt: '2026-11-30T00:00:00Z', isTrial: false, graceUntil: '2026-12-16T00:00:00Z' })], NOW);
  assert.ok(record);
  assert.equal(record.inGrace, true);
  assert.equal(record.activeUntil, '2026-12-16T00:00:00Z');
  assert.equal(hasPaidAccess(evaluateStatus(record, at('2026-12-15T23:59:59Z'))), true);
  assert.equal(hasPaidAccess(evaluateStatus(record, at('2026-12-16T00:00:01Z'))), false);
});

test('多筆有效交易取權益最長的一筆；別的 App 的商品與已撤銷的交易不算', () => {
  const record = recordFromStore([
    row({ productId: 'other_app_product', expiresAt: '2030-01-01T00:00:00Z' }),
    row({ productId: PRODUCT_IDS.yearly, expiresAt: '2027-12-01T00:00:00Z', revokedAt: '2026-11-20T00:00:00Z' }),
    row({ productId: PRODUCT_IDS.monthly, expiresAt: '2027-01-01T00:00:00Z', isTrial: false }),
  ], NOW);
  assert.equal(record?.productId, PRODUCT_IDS.monthly);
  assert.equal(record?.activeUntil, '2027-01-01T00:00:00Z');
  assert.equal(recordFromStore([row({ productId: 'other_app_product' })], NOW), null);
});

test('確認沒有有效權益時：訂過的記成到期（退款立刻到期），沒訂過維持沒有紀錄', () => {
  assert.equal(reconcileRecord(null, [], NOW), null);
  const old = recordFromStore([row({ expiresAt: '2027-01-01T00:00:00Z' })], at('2026-11-01T00:00:00Z'));
  const refunded = reconcileRecord(old, [], NOW);
  assert.equal(refunded?.activeUntil, NOW.toISOString());
  assert.equal(evaluateStatus(refunded, NOW).kind, 'expired');
  const lapsed = recordFromStore([row({ expiresAt: '2026-11-15T00:00:00Z' })], at('2026-11-01T00:00:00Z'));
  assert.equal(reconcileRecord(lapsed, [], NOW)?.activeUntil, '2026-11-15T00:00:00Z');
});

test('壞掉或不是本 App 商品的紀錄一律當作沒有紀錄', () => {
  assert.equal(parseRecord(null), null);
  assert.equal(parseRecord('{'), null);
  assert.equal(parseRecord(JSON.stringify({ productId: 'free_forever', activeUntil: '2099-01-01T00:00:00Z', confirmedAt: NOW.toISOString() })), null);
  assert.equal(parseRecord(JSON.stringify({ productId: PRODUCT_IDS.yearly, activeUntil: 'x', confirmedAt: NOW.toISOString() })), null);
});

test('開發版（關掉內購）付費功能全開，但不影響有內購的版本', () => {
  assert.equal(hasPaidAccess(evaluateStatus(null, NOW, { devUnlocked: true })), true);
  assert.equal(hasPaidAccess(evaluateStatus(null, NOW, { devUnlocked: false })), false);
});

function memory(initial: string | null = null): RecordStorage & { value: string | null } {
  const box = { value: initial, read: () => box.value, write: (v: string | null) => { box.value = v; } };
  return box;
}

function fakeStore(): StorePort & { rows: StoreEntitlement[]; online: boolean; fire(): void } {
  let listener: (() => void) | null = null;
  const store = {
    available: true, rows: [] as StoreEntitlement[], online: true,
    fire: () => listener?.(),
    loadOffer: async () => ({ products: [
      { id: PRODUCT_IDS.monthly, period: 'month' as const, displayPrice: 'NT$90' },
      { id: PRODUCT_IDS.yearly, period: 'year' as const, displayPrice: 'NT$690' },
    ], trialEligible: true }),
    currentEntitlements: async () => { if (!store.online) throw new Error('offline'); return store.rows; },
    purchase: async () => { store.rows = [row()]; return 'purchased' as const; },
    restore: async () => {},
    onUpdate: (l: () => void) => { listener = l; return () => { listener = null; }; },
  };
  return store;
}

test('訂閱服務：購買後轉有效並通知畫面；紀錄寫進獨立儲存區', async () => {
  const store = fakeStore(); const storage = memory(); let clock = NOW;
  const service = createSubscriptionService({ store, storage, now: () => clock });
  let notified = 0; service.subscribe(() => { notified += 1; });
  assert.equal(service.getStatus().kind, 'never');
  assert.equal(await service.purchase(PRODUCT_IDS.monthly), 'purchased');
  assert.equal(service.getStatus().kind, 'active');
  assert.equal(notified, 1);
  assert.equal(parseRecord(storage.value)?.productId, PRODUCT_IDS.monthly);
  // 重開 App：還沒查到 App Store 之前就用上次確認的紀錄，不會先閃付費牆。
  clock = at('2026-12-02T00:00:00Z');
  const reopened = createSubscriptionService({ store, storage, now: () => clock });
  assert.equal(reopened.getStatus().kind, 'active');
});

test('訂閱服務：離線時沿用上次確認的到期時間，過了到期時間就降級', async () => {
  const store = fakeStore(); store.rows = [row()];
  const storage = memory(); let clock = NOW;
  const service = createSubscriptionService({ store, storage, now: () => clock });
  assert.equal(await service.refresh(), true);
  store.online = false;
  clock = at('2027-02-01T00:00:00Z');
  assert.equal(await service.refresh(), false);
  assert.equal(service.getStatus().kind, 'active');
  clock = at('2027-03-02T00:00:00Z');
  assert.equal(await service.refresh(), false);
  assert.equal(service.getStatus().kind, 'expired');
});

test('訂閱服務：App 啟動就監聽交易更新，別處取消或退款會即時降級', async () => {
  const store = fakeStore(); store.rows = [row()];
  const service = createSubscriptionService({ store, storage: memory(), now: () => NOW });
  const stop = service.start();
  await service.refresh();
  assert.equal(service.getStatus().kind, 'active');
  store.rows = [];
  store.fire();
  await new Promise((r) => setImmediate(r));
  assert.equal(service.getStatus().kind, 'expired');
  stop();
});

test('沒有內購的版本：購買與還原丟出說明錯誤，權益照本機紀錄判斷', async () => {
  const service = createSubscriptionService({ store: unavailableStore, storage: memory(), now: () => NOW });
  assert.equal(service.storeAvailable, false);
  assert.equal(await service.refresh(), false);
  assert.equal(service.getStatus().kind, 'never');
  await assert.rejects(service.purchase(PRODUCT_IDS.yearly), StoreUnavailableError);
  await assert.rejects(service.restore(), StoreUnavailableError);
});

test('Xcode 本機 StoreKit 測試設定檔：商品代號、價格、同一群組與 3 個月免費試用都和程式一致', () => {
  const config = JSON.parse(readFileSync(new URL('../../storekit/Premium.storekit', import.meta.url), 'utf8')) as {
    subscriptionGroups: { name: string; subscriptions: {
      productID: string; displayPrice: string; recurringSubscriptionPeriod: string; familyShareable: boolean;
      introductoryOffer: { paymentMode: string; subscriptionPeriod: string; numberOfPeriods: number } | null;
    }[] }[];
  };
  assert.equal(config.subscriptionGroups.length, 1);
  const group = config.subscriptionGroups[0];
  const byId = new Map(group.subscriptions.map((s) => [s.productID, s]));
  assert.deepEqual([...byId.keys()].sort(), [PRODUCT_IDS.monthly, PRODUCT_IDS.yearly].sort());
  assert.equal(byId.get(PRODUCT_IDS.monthly)?.displayPrice, '90');
  assert.equal(byId.get(PRODUCT_IDS.monthly)?.recurringSubscriptionPeriod, 'P1M');
  assert.equal(byId.get(PRODUCT_IDS.yearly)?.displayPrice, '690');
  assert.equal(byId.get(PRODUCT_IDS.yearly)?.recurringSubscriptionPeriod, 'P1Y');
  for (const s of group.subscriptions) {
    assert.equal(s.familyShareable, false); // 家人共享第一版不開
    assert.deepEqual(s.introductoryOffer && { m: s.introductoryOffer.paymentMode, p: s.introductoryOffer.subscriptionPeriod, n: s.introductoryOffer.numberOfPeriods },
      { m: 'free', p: 'P3M', n: 1 });
  }
});

test('付費牆文字：價格由 App Store 帶入；有試用資格才寫試用，並列出預算資料匯出與到期後的資料保留', async () => {
  const { paywallSections, purchaseButtonLabel } = await import('./paywallText.ts');
  const text = (eligible: boolean) => paywallSections({ monthly: 'NT$90', yearly: 'NT$690' }, eligible)
    .flatMap((s) => [s.heading ?? '', ...s.lines]).join('\n');
  const a = text(true); const b = text(false);
  assert.match(a, /免費試用 3 個月/); assert.match(a, /每年 NT\$690/); assert.match(a, /每月 NT\$90/);
  assert.doesNotMatch(b, /免費試用|限試用一次/);
  for (const t of [a, b]) {
    assert.match(t, /預算資料匯出/); assert.match(t, /刪除 App 不會取消訂閱/); assert.match(t, /交易 CSV 匯出與備份仍可使用/);
  }
  assert.equal(purchaseButtonLabel(true, 'year', 'NT$690'), '開始免費試用（年方案 NT$690／年）');
  assert.equal(purchaseButtonLabel(false, 'month', 'NT$90'), '訂閱月方案 NT$90／月');
});

test('設定頁的訂閱狀態說明：試用、寬限期、到期都講清楚資料保留', async () => {
  const { subscriptionSummary } = await import('./statusText.ts');
  assert.match(subscriptionSummary({ kind: 'active', productId: PRODUCT_IDS.yearly, isTrial: true, inGrace: false, willAutoRenew: true, activeUntil: '2027-03-01T00:00:00Z' }), /年方案：免費試用中，試用到 2027\/3\/1/);
  assert.match(subscriptionSummary({ kind: 'active', productId: PRODUCT_IDS.yearly, isTrial: true, inGrace: false, willAutoRenew: false, activeUntil: '2027-03-01T00:00:00Z' }), /已關閉自動續訂，不會再扣款/);
  assert.match(subscriptionSummary({ kind: 'active', productId: PRODUCT_IDS.monthly, isTrial: false, inGrace: true, willAutoRenew: true, activeUntil: '2026-12-16T00:00:00Z' }), /寬限期/);
  assert.match(subscriptionSummary({ kind: 'expired', productId: PRODUCT_IDS.monthly, endedAt: '2027-03-01T00:00:00Z' }), /仍保留且可檢視；預算資料匯出已停用/);
  assert.match(subscriptionSummary({ kind: 'never' }), /免費版/);
});

test('把手機時間調回上次確認之前，不能延長離線權益', () => {
  // 12/20 確認時權益到 12/10 已結束；之後把手機時間調回 12/05 仍是到期。
  const record = { productId: PRODUCT_IDS.monthly, activeUntil: '2026-12-10T00:00:00.000Z', isTrial: false, inGrace: false,
    willAutoRenew: false, confirmedAt: '2026-12-20T00:00:00.000Z' } as const;
  assert.equal(evaluateStatus(record, at('2026-12-05T00:00:00Z')).kind, 'expired');
  assert.equal(evaluateStatus({ ...record, confirmedAt: '2026-12-01T00:00:00.000Z' }, at('2026-12-05T00:00:00Z')).kind, 'active');
});

test('訂閱服務：手機休眠時計時器沒跑，回來第一次讀狀態就降級', async () => {
  const store = fakeStore(); store.rows = [row({ expiresAt: '2026-12-02T00:00:00Z' })];
  let clock = NOW;
  const service = createSubscriptionService({ store, storage: memory(), now: () => clock });
  await service.refresh();
  assert.equal(service.getStatus().kind, 'active');
  let notified = 0; service.subscribe(() => { notified += 1; });
  clock = at('2026-12-03T00:00:00Z');
  assert.equal(service.getStatus().kind, 'expired');
  await Promise.resolve();
  assert.equal(notified, 1);
});

test('訂閱服務：本來有效卻查到空結果時再確認一次，暫時的空結果不會誤鎖', async () => {
  const store = fakeStore(); store.rows = [row()];
  const service = createSubscriptionService({ store, storage: memory(), now: () => NOW });
  await service.refresh();
  let calls = 0; const real = store.currentEntitlements;
  store.currentEntitlements = async () => { calls += 1; return calls === 1 ? [] : real(); };
  await service.refresh();
  assert.equal(service.getStatus().kind, 'active');
  assert.equal(calls, 2);
});

test('正式建置不得關掉內購：eas.json 任何 production 設定都不能有 EXPO_PUBLIC_IAP', async () => {
  const { existsSync } = await import('node:fs');
  const url = new URL('../../eas.json', import.meta.url);
  if (!existsSync(url)) return; // 還沒有 eas.json（付費帳號開通後才建）
  const eas = JSON.parse(readFileSync(url, 'utf8')) as { build?: Record<string, { env?: Record<string, string>; distribution?: string }> };
  for (const [name, profile] of Object.entries(eas.build ?? {})) {
    if (name === 'production' || profile.distribution === 'store') assert.equal(profile.env?.EXPO_PUBLIC_IAP, undefined, name);
  }
});
