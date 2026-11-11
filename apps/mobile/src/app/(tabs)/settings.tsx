import { Link } from 'expo-router';
import { View } from 'react-native';
import { Placeholder } from '../../ui/Placeholder.tsx';

// 佔位畫面：由票 14、15、16 等換掉整個檔案。
export default function Screen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Link href="/budget-settings" style={{ padding: 20, fontSize: 17, color: '#2563eb' }}>預算與分類 ›</Link>
      <Placeholder title="設定" ticket="票 14、15、16 等" />
    </View>
  );
}
