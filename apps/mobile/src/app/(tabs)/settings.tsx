import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../../ui/theme.ts';

export default function Screen() {
  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.background }}>
      <Link href="/csv-import" asChild>
        <Pressable accessibilityRole="button" style={{ minHeight: 48, padding: 12, borderRadius: 8, backgroundColor: colors.surface }}>
          <Text style={{ fontSize: 16, color: colors.accent }}>匯入 CSV</Text>
        </Pressable>
      </Link>
    </View>
  );
}
