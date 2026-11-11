import { Stack } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../ui/theme.ts';

export default function CsvSpecScreen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: 'CSV 規格說明', headerBackTitle: '返回' }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>記帳 CSV 規格</Text>
        <Section title="檔案格式">
          第一列放欄位名稱，以逗號分隔。支援 UTF-8（可含 BOM）與 Big5。欄位順序可調整，也支援下列其他 App 搬家用的 12 欄格式。
        </Section>
        <View style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 8, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>12 欄標題</Text>
          <Text selectable style={{ color: colors.text, lineHeight: 24 }}>
            日期,類別,大類別,金額,幣別,成員,帳戶,標籤,備註,收支區分,上次更新,UUID
          </Text>
          <Text style={{ color: colors.muted }}>取用日期、類別、金額、成員、帳戶、備註與收支區分，其餘欄位略過；金額一律視為新台幣。</Text>
        </View>
        <Section title="必要欄位">
          類別（也可寫「分類」）、金額。分類必須先在帳本中存在；金額為大於 0 的新台幣整數，可使用加上雙引號的千分位數字，例如 "1,200"。
        </Section>
        <Section title="選填欄位與預設值">
          {'日期：支援 2026-11-11、2026/11/11、20261111；缺漏或無效時使用匯入當天。\n\n帳戶：使用已存在的帳戶名稱；缺漏或找不到時使用現金帳戶。若帳本沒有現金帳戶，會在新增交易時補建一個開帳餘額為 0 的現金帳戶；同名已被使用時會加上編號。\n\n收支別（也可寫「收支」或「收支區分」）：支出／支、收入／收；缺漏或無效時使用支出。\n\n備註：可留空。\n\n成員：使用已存在的成員名稱；缺漏或找不到時留空，不會自動建立成員。\n\n結果會列出套用預設值的列數與欄位，包含最後被略過或拒收的列。'}
        </Section>
        <Section title="拒收的情況">
          分類不存在、金額無法解析或不是正整數、交易日期在已結月份、分類與收支別不符，該列會拒收並說明原因。分類不存在時請先新增分類，再重新匯入；匯入不會自動建立分類，也不會變更既有分類的收支別。
        </Section>
        <Section title="重複匯入">
          以日期、類別與金額計算已有筆數。同一天同分類同金額的兩筆交易可以保留；通過驗證後，會略過已有的數量。已結月份在重複判定前就會拒收，因此回匯已結交易會顯示拒收，且不會新增。帳戶、備註、成員與收支別不參與重複判定。需要日後重複匯入時，建議保留日期欄，避免預設日期隨匯入當天改變。
        </Section>
        <Section title="逗號、雙引號與換行">
          欄位內有逗號、雙引號或換行時，請以雙引號包住整個欄位；欄位內的雙引號寫成連續兩個雙引號。備註可以有多行。
        </Section>
        <View style={{ backgroundColor: colors.surface, padding: 12, borderRadius: 8, gap: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>範例（虛構資料）</Text>
          <Text selectable style={{ color: colors.text, lineHeight: 24 }}>
            {'日期,類別,金額,帳戶,收支別,備註,成員\n2026-11-11,飲食,120,現金,支出,午餐,\n2026-11-11,薪資,30000,銀行,收入,薪水,'}
          </Text>
        </View>
        <Section title="匯出與免費使用">
          匯入與匯出皆免費。匯出包含全部交易，使用上述七欄與 UTF-8 編碼；再次匯入同一本帳不會新增已有交易。CSV 只包含交易，整本帳的備份請使用備份檔。
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{title}</Text>
      <Text style={{ color: colors.text, lineHeight: 24 }}>{children}</Text>
    </View>
  );
}
