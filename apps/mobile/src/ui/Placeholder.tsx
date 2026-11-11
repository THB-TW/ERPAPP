import { Text, View } from 'react-native';
import { colors } from './theme.ts';

/** 尚未實作的分頁先放這個；負責的票完成時整個換掉該分頁的畫面檔。 */
export function Placeholder({ title, ticket }: { title: string; ticket: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: colors.background }}>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors.text }}>{title}</Text>
      <Text style={{ marginTop: 8, color: colors.muted }}>這一頁還在製作中（{ticket}）。</Text>
    </View>
  );
}
