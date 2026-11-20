import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openNodeDatabase } from '../db/nodeDriver.ts';
import { openLedger, type PlannedNotification } from '../ledger/index.ts';
import { managedNotificationId, managedNotificationIds, notificationRequests, notificationPlanThrough, notificationIdsToCancel } from './notificationSchedule.ts';

const NOW = new Date('2026-11-11T04:00:00Z');
function notification(id: string, fireAt = NOW.toISOString()): PlannedNotification {
  return { id, kind: 'entry', fireAt, title: '合成提醒', body: '合成內容' };
}

test('管理前綴只選本模組通知，保留其他用途並去重', () => {
  const id = managedNotificationId('entry:2026-11-11');
  assert.equal(id, 'erpapp:ledger-reminder:entry:2026-11-11');
  assert.deepEqual(managedNotificationIds([id, 'entry:2026-11-11', 'erpapp:other:123',
    'erpapp:ledger-reminder:', id]), [id]);
});

test('只取消新計畫已移除的管理排程，仍需要的識別碼留給原生更新', () => {
  const keep = managedNotificationId('entry:keep');
  const remove = managedNotificationId('entry:remove');
  const requests = notificationRequests([notification('entry:keep')], NOW);
  assert.deepEqual(notificationIdsToCancel([keep, remove, 'other-purpose:1'], requests), [remove]);
  assert.deepEqual(notificationIdsToCancel([keep, remove, 'other-purpose:1'], []), [keep, remove]);
});

test('真 SQLite 帳本的台北時間計畫轉成一次性 UTC Date，識別碼與內容保持穩定', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  const settings = await ledger.getNotificationSettings();
  settings.enabled.entry = true;
  settings.entryTime = '21:15';
  await ledger.saveNotificationSettings(settings);
  const plan = await ledger.getNotificationPlan({ now: NOW, through: new Date('2026-11-12T04:00:00Z'), hasEntitlement: false });
  const before = await ledger.getBackupStatus();
  const [request] = notificationRequests(plan, NOW);
  assert.equal(request.identifier, managedNotificationId(plan[0].id));
  assert.equal(request.date?.toISOString(), '2026-11-11T13:15:00.000Z');
  assert.deepEqual(request.content, { title: plan[0].title, body: plan[0].body, sound: 'default' });
  assert.deepEqual(notificationRequests(plan, NOW), [request]);
  assert.deepEqual(await ledger.getBackupStatus(), before);
});

test('即時或查詢後才過期的通知立即送出，保留仍在未來的絕對時刻', () => {
  const requests = notificationRequests([notification('entry:past', '2026-11-11T03:59:59Z'),
    notification('entry:now'), notification('entry:future', '2026-11-11T04:00:02Z')], NOW);
  assert.deepEqual(requests.map((request) => request.date?.toISOString() ?? null), [
    null, null, '2026-11-11T04:00:02.000Z',
  ]);
});

test('按時間和識別碼穩定排序、去重，容量先保留其他用途的待排通知', () => {
  const rows = [notification('entry:z', '2026-11-12T04:00:00Z'), notification('entry:b'),
    notification('entry:a'), notification('entry:a')];
  assert.deepEqual(notificationRequests(rows, NOW, 62).map((row) => row.identifier),
    [managedNotificationId('entry:a'), managedNotificationId('entry:b')]);
  assert.equal(notificationRequests(rows, NOW, 64).length, 0);
  assert.equal(notificationRequests(Array.from({ length: 70 }, (_, i) => notification(`entry:${i}`)), NOW).length, 64);
  assert.equal(rows.length, 4);
});

test('無效日期與識別碼在碰原生層前就拒絕', () => {
  assert.throws(() => notificationRequests([notification('entry:bad', '無效日期')], NOW), /時間/);
  assert.throws(() => notificationRequests([notification('')], NOW), /識別碼/);
  assert.throws(() => notificationRequests([], new Date('無效日期')), /時間/);
});

test('剛完成備份也會預排35天後的提醒，不必等使用者再開App', async (t) => {
  const ledger = await openLedger(openNodeDatabase(':memory:'), { now: () => NOW });
  t.after(() => ledger.close());
  const settings = await ledger.getNotificationSettings();
  settings.enabled.entry = true;
  settings.enabled.backupOverdue = true;
  await ledger.saveNotificationSettings(settings);
  await ledger.recordBackupDelivered(NOW.toISOString());
  const plan = await ledger.getNotificationPlan({ now: NOW, through: notificationPlanThrough(NOW), hasEntitlement: false });
  const overdue = plan.find((row) => row.kind === 'backupOverdue')!;
  assert.ok(overdue);
  assert.equal(new Date(overdue.fireAt).getTime(), NOW.getTime() + 35 * 86_400_000 + 1);
  assert.ok(notificationRequests(plan, NOW).some((row) => row.identifier === managedNotificationId(overdue.id)));
});
