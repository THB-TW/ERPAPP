import { router, type Href } from 'expo-router';
import { View } from 'react-native';
import { useSubscriptionStatus } from '../../../ui/closeEntitlement.ts';
import { Banner, Footnote, Group, kit, NavRow } from '../../../ui/kit.tsx';
import { TabScrollView } from '../../../ui/LargeTitle.tsx';

// 區段順序（由上到下）只由這個陣列決定；SettingsGroup 型別由它推得，名稱只寫這一次。
// 新增列時 group 要用這裡出現過的名稱；要新開區段就加進這個陣列。
const GROUPS = ['訂閱', '預算', '帳戶與投資', '資料', '提醒'] as const;
type SettingsGroup = (typeof GROUPS)[number];

// 設定分頁：各票在 ROWS 加一列（並指定 group），指到自己放在 src/app/ 底下的子頁面（由根堆疊推入）。
// 畫面依 group 分區，同一區的列放在同一張 Group 卡片裡，區內順序照 ROWS 內的順序。
const ROWS: { group: SettingsGroup; title: string; hint: string; href: Href }[] = [
  { group: '訂閱', title: '訂閱', hint: '訂閱狀態、管理訂閱、還原購買', href: '/subscription' }, // 票 22
  { group: '預算', title: '預算與分類', hint: '修改預算上限、預算組與交易分類歸屬', href: '/budget-settings' }, // 票 10
  { group: '預算', title: '預算挪用與調整', hint: '補入儲備、前期更正、沖銷與調整紀錄', href: '/adjustments' }, // 票 14
  { group: '資料', title: '匯入 CSV', hint: '其他 App 搬家、匯出全部交易、CSV 規格', href: '/csv-import' }, // 票 15
  { group: '帳戶與投資', title: '帳戶管理與餘額', hint: '新增、改名、停用帳戶，開帳餘額與目前餘額', href: '/accounts' }, // 票 08
  { group: '帳戶與投資', title: '投資', hint: '台股與虛擬貨幣部位、買賣、手動市值與財產分配', href: '/investment' }, // 票 20
  { group: '預算', title: '貸款／分期', hint: '每月提撥、累積儲備與剩餘本金', href: '/loans' }, // 票 19
  { group: '資料', title: '備份與還原', hint: '匯出備份檔、匯入備份檔、上次備份日期', href: '/settings-backup' }, // 票 16
  { group: '提醒', title: '提醒設定', hint: '個別提醒開關、記帳時間、發薪日與信用卡結帳日', href: '/settings-notifications' }, // 票 21
];

export default function SettingsScreen() {
  const status = useSubscriptionStatus();
  return (
    <TabScrollView title="設定">
      {status.kind === 'dev_unlocked' ? (
        <Banner tone="warning">開發版・未接內購：進階功能全部開放，上架版本不會有這個狀態。</Banner>
      ) : null}
      {GROUPS.map((group) => {
        const rows = ROWS.filter((row) => row.group === group);
        if (rows.length === 0) return null;
        return (
          <View key={group} style={kit.section}>
            <Footnote>{group}</Footnote>
            <Group>
              {rows.map((row) => (
                <NavRow key={row.title} title={row.title} subtitle={row.hint} onPress={() => router.push(row.href)} />
              ))}
            </Group>
          </View>
        );
      })}
    </TabScrollView>
  );
}
