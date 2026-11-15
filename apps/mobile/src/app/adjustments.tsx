import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { AdjustmentScreen } from '../ui/AdjustmentScreen.tsx';
import { VisualAdjustments } from '../ui/VisualAdjustments.tsx';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { NavRow, kit, text } from '../ui/kit.tsx';
import { userMessage } from '../ui/format.ts';
export default function AdjustmentsScreen() {
  const ledger = useLedger();
  const [mode, setMode] = useState<'visual' | 'list' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setMode(null); setError(null);
    ledger.getAdjustmentViewMode().then(value => { if (!cancelled) setMode(value); }, e => { if (!cancelled) setError(userMessage(e, '讀取失敗。')); });
    return () => { cancelled = true; };
  }, [ledger, retry]));
  if (!mode) return <View style={[kit.screen, kit.content]}>{error ? <><Text style={text.error}>{error}</Text><NavRow title="重試" onPress={() => setRetry(n => n + 1)} /></> : <ActivityIndicator />}</View>;
  return mode === 'list' ? <AdjustmentScreen /> : <VisualAdjustments />;
}
