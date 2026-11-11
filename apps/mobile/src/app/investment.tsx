import { Stack, useFocusEffect } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Account, Ledger } from '../ledger/index.ts';
import { BudgetRuleError } from '../ledger/index.ts';
import { shiftMonth, taipeiDate } from '../calc/dates.ts';
import { hasMonthlyCloseEntitlement } from '../ui/closeEntitlement.ts';
import { formatAmount, userMessage } from '../ui/format.ts';
import { useLedger } from '../ui/LedgerProvider.tsx';
import { colors } from '../ui/theme.ts';

type Portfolio = Awaited<ReturnType<Ledger['getInvestmentPortfolio']>>;
type InvestmentTransaction = Awaited<ReturnType<Ledger['listInvestmentTransactions']>>[number];
type Valuation = Awaited<ReturnType<Ledger['listInvestmentValuations']>>[number];
type Form = 'holding' | 'transaction' | 'valuation' | 'opening' | null;
type TxType = 'opening' | 'buy' | 'sell' | 'dividend';
const TX_LABELS: Record<TxType, string> = { opening: '期初', buy: '買進', sell: '賣出', dividend: '配息' };

export default function InvestmentScreen() {
  const ledger = useLedger();
  const headerHeight = useHeaderHeight();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [opening, setOpening] = useState<Awaited<ReturnType<Ledger['getInvestmentOpening']>>>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [hasEntitlement, setHasEntitlement] = useState(false);
  const [form, setForm] = useState<Form>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const [holdingId, setHoldingId] = useState<number | null>(null);
  const [assetClass, setAssetClass] = useState<'stock' | 'crypto'>('stock');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [txType, setTxType] = useState<TxType>('buy');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [quantity, setQuantity] = useState('');
  const [fundSource, setFundSource] = useState<'internal' | 'external'>('internal');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [valuationTime, setValuationTime] = useState('12:00');
  const [openingMonth, setOpeningMonth] = useState('');
  const [openingAmount, setOpeningAmount] = useState('');
  const [openingNegative, setOpeningNegative] = useState(false);

  const load = useCallback(async () => {
    const [nextPortfolio, nextAccounts, nextTransactions, nextValuations, nextOpening] = await Promise.all([
      ledger.getInvestmentPortfolio(), ledger.listAccounts(), ledger.listInvestmentTransactions(),
      ledger.listInvestmentValuations(), ledger.getInvestmentOpening(),
    ]);
    return { nextPortfolio, nextAccounts, nextTransactions, nextValuations, nextOpening };
  }, [ledger]);

  const applyLoaded = useCallback((data: Awaited<ReturnType<typeof load>>) => {
    setPortfolio(data.nextPortfolio);
    setAccounts(data.nextAccounts);
    setTransactions(data.nextTransactions);
    setValuations(data.nextValuations);
    setOpening(data.nextOpening);
    setLoaded(true);
  }, []);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    setHasEntitlement(hasMonthlyCloseEntitlement());
    setLoaded(false);
    setError(null);
    load().then((data) => { if (!cancelled) applyLoaded(data); }, (e: unknown) => {
      if (!cancelled) setError(investmentMessage(e, '讀取投資失敗，請返回後再試一次。'));
    });
    return () => { cancelled = true; };
  }, [load, applyLoaded]));

  const disabled = !loaded || saving || !hasEntitlement;
  const selected = portfolio?.positions.find((p) => p.holdingId === holdingId);
  const isTrade = txType === 'buy' || txType === 'sell';
  const needsQuantity = selected?.assetClass === 'stock' && txType !== 'dividend';
  const activeAccounts = accounts.filter((a) => a.active);

  function begin(next: Form, id?: number) {
    if (disabled) return;
    setForm(next);
    setHoldingId(id ?? portfolio?.positions.find((p) => p.active)?.holdingId ?? null);
    setAssetClass('stock');
    setSymbol('');
    setName('');
    setDate(taipeiDate(new Date()));
    setTxType('buy');
    setAmount('');
    setQuantity('');
    setFundSource('internal');
    setAccountId(activeAccounts[0]?.id ?? null);
    setNote('');
    setUnitPrice('');
    setValuationTime('12:00');
    setOpeningMonth(opening?.asOfMonth ?? shiftMonth(taipeiDate(new Date()).slice(0, 7), -1));
    setOpeningAmount(String(Math.abs(opening?.netDeployed ?? 0)));
    setOpeningNegative((opening?.netDeployed ?? 0) < 0);
    setError(null);
    setNotice(null);
  }

  async function save() {
    if (disabled || savingRef.current || !form) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    let saved = false;
    try {
      const access = { hasEntitlement: hasMonthlyCloseEntitlement() };
      if (form === 'holding') {
        await ledger.addInvestmentHolding({ assetClass, name, symbol: assetClass === 'stock' ? symbol : undefined }, access);
      } else if (form === 'opening') {
        await ledger.setInvestmentOpening({ asOfMonth: openingMonth, netDeployed: integerInput(openingAmount) * (openingNegative ? -1 : 1) }, access);
      } else if (form === 'transaction') {
        await ledger.addInvestmentTransaction({
          holdingId: holdingId ?? 0, date, txType, amount: integerInput(amount),
          quantity: needsQuantity ? quantity : null,
          fundSource: isTrade ? fundSource : 'external',
          accountId: isTrade && fundSource === 'internal' ? accountId : null, note,
        }, access);
      } else {
        await ledger.addInvestmentValuation({ holdingId: holdingId ?? 0, asOf: `${date}T${valuationTime}:00+08:00`,
          unitPrice: selected?.assetClass === 'stock' ? unitPrice : null,
          marketValue: selected?.assetClass === 'crypto' ? integerInput(amount) : null,
        }, access);
      }
      saved = true;
      setForm(null);
      setLoaded(false);
      applyLoaded(await load());
      setNotice('已儲存。');
    } catch (e) {
      setError(saved ? '資料已儲存，但讀取失敗，請返回後再試一次。' : investmentMessage(e, '儲存投資失敗，請再試一次。'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={['bottom']}>
      <Stack.Screen options={{ title: '投資' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" contentContainerStyle={{ padding: 16, gap: 16 }}>
          {!loaded ? <Text style={{ color: colors.muted }}>正在讀取投資…</Text> : null}
          {loaded && !hasEntitlement ? <Text style={{ color: colors.muted }}>目前為唯讀，可查看投資紀錄；有效訂閱期間可新增與修改。</Text> : null}
          {form === null && portfolio ? (
            <>
              <Card title="累計投入淨額">
                <Amount value={portfolio.netDeployed} />
                <Text style={{ color: colors.muted }}>供總資產核對使用，與持有成本分開計算。</Text>
                <Text style={{ color: colors.muted }}>期初投入額：{opening ? `${opening.asOfMonth} 月底 ${formatAmount(opening.netDeployed)} 元` : '尚未設定（以 0 元起算）'}</Text>
                <Action label="設定期初投入額" disabled={disabled} onPress={() => begin('opening')} />
              </Card>
              <Card title="財產分配">
                <Row label="帳面總資產" value={portfolio.bookTotal} />
                <Text style={{ color: colors.muted }}>非投資部分＝帳面總資產－累計投入淨額。投資依手動市值快照計算，未填時使用成本。</Text>
                <AllocationRow label="非投資部分" value={portfolio.nonInvestment} total={portfolio.allocationTotal} />
                {portfolio.positions.filter((p) => p.active).map((p) => <AllocationRow key={p.holdingId} label={p.name} value={p.marketValue} total={portfolio.allocationTotal} />)}
                <Row label="合計" value={portfolio.allocationTotal} />
                {portfolio.nonInvestment < 0 ? <Text style={{ color: colors.muted }}>非投資部分為負數，請核對帳面總資產與累計投入淨額。</Text> : null}
              </Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 19 }}>投資部位</Text>
                <Action label="＋ 新增標的" disabled={disabled} onPress={() => begin('holding')} />
              </View>
              {!portfolio.positions.length ? <Text style={{ color: colors.muted }}>尚無標的。可新增台股個股，或一個虛擬貨幣標的。</Text> : null}
              {portfolio.positions.map((p) => (
                <Card key={p.holdingId} title={`${p.symbol ? `${p.symbol} ` : ''}${p.name}${p.active ? '' : '（已停用）'}`}>
                  <Text style={{ color: colors.muted }}>{p.assetClass === 'stock' ? `台股・持有 ${p.quantity} 股` : '虛擬貨幣・成本收回法'}</Text>
                  <Row label="持有成本" value={p.cost} />
                  <Row label={p.hasValuation ? '市值' : '市值（尚未填快照，以成本顯示）'} value={p.marketValue} />
                  {p.valuationAsOf ? <Text style={{ color: colors.muted }}>快照時間：{displayTime(p.valuationAsOf)}</Text> : null}
                  <Row label="未實現損益" value={p.unrealized} />
                  {p.assetClass === 'stock' ? <Row label="已實現損益" value={p.realizedPnl} /> : <Text style={{ color: colors.muted }}>賣出僅沖減成本，不認列已實現損益。</Text>}
                  <Row label="配息合計" value={p.dividends} />
                  <Row label="總報酬" value={p.totalReturn} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                    <Action label="＋ 記交易" disabled={disabled || !p.active} onPress={() => begin('transaction', p.holdingId)} />
                    <Action label="＋ 市值快照" disabled={disabled || !p.active} onPress={() => begin('valuation', p.holdingId)} />
                    <Action label={historyId === p.holdingId ? '收起歷史' : '查看歷史'} disabled={saving} onPress={() => setHistoryId(historyId === p.holdingId ? null : p.holdingId)} />
                  </View>
                  {historyId === p.holdingId ? (
                    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12, gap: 10 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>交易紀錄</Text>
                      {!transactions.some((t) => t.holdingId === p.holdingId) ? <Text style={{ color: colors.muted }}>尚無交易。</Text> : null}
                      {transactions.filter((t) => t.holdingId === p.holdingId).slice().reverse().map((t) => (
                        <View key={t.id} style={{ gap: 3 }}>
                          <Text style={{ color: colors.text }}>{t.date}・{TX_LABELS[t.txType]}・{formatAmount(t.amount)} 元{t.quantity !== null ? `・${t.quantity} 股` : ''}</Text>
                          {t.txType === 'buy' || t.txType === 'sell' ? <Text style={{ color: colors.muted }}>{t.fundSource === 'internal' ? `帳內・${accounts.find((a) => a.id === t.accountId)?.name ?? '帳戶'}` : '帳外'}</Text> : null}
                          {t.note ? <Text style={{ color: colors.muted }}>{t.note}</Text> : null}
                        </View>
                      ))}
                      <Text style={{ color: colors.text, fontWeight: '600', marginTop: 8 }}>市值快照歷史</Text>
                      {!valuations.some((v) => v.holdingId === p.holdingId) ? <Text style={{ color: colors.muted }}>尚無市值快照。</Text> : null}
                      {valuations.filter((v) => v.holdingId === p.holdingId).slice().reverse().map((v) => <Text key={v.id} style={{ color: colors.text }}>{displayTime(v.asOf)}・{p.assetClass === 'stock' ? `每股 ${v.unitPrice} 元` : `${formatAmount(v.marketValue ?? 0)} 元`}</Text>)}
                    </View>
                  ) : null}
                </Card>
              ))}
            </>
          ) : null}

          {form ? (
            <Card title={{ holding: '新增標的', transaction: '新增投資交易', valuation: '新增市值快照', opening: '期初投入額' }[form]}>
              {form === 'holding' ? (
                <>
                  <Choices>
                    <Choice label="台股個股" selected={assetClass === 'stock'} disabled={disabled} onPress={() => setAssetClass('stock')} />
                    <Choice label="虛擬貨幣" selected={assetClass === 'crypto'} disabled={disabled} onPress={() => setAssetClass('crypto')} />
                  </Choices>
                  {assetClass === 'stock' ? <Field label="股票代號" value={symbol} onChangeText={setSymbol} disabled={disabled} /> : <Text style={{ color: colors.muted }}>所有虛擬貨幣合併為一個標的，只記錄金額，不記單位數量。</Text>}
                  <Field label="標的名稱" value={name} onChangeText={setName} disabled={disabled} />
                </>
              ) : null}
              {form === 'opening' ? (
                <>
                  <Text style={{ color: colors.muted }}>這是截至指定月底，已投入且仍包含在帳面總資產內的宣告金額。與「期初」交易的持有成本分開，不從歷史買賣重算。</Text>
                  <Field label="期初月份" placeholder="YYYY-MM" value={openingMonth} onChangeText={setOpeningMonth} disabled={disabled} />
                  <Field label="期初投入額（元）" value={openingAmount} onChangeText={setOpeningAmount} disabled={disabled} numeric />
                  <Choices>
                    <Choice label="正數／零" selected={!openingNegative} disabled={disabled} onPress={() => setOpeningNegative(false)} />
                    <Choice label="負數" selected={openingNegative} disabled={disabled} onPress={() => setOpeningNegative(true)} />
                  </Choices>
                  <Text style={{ color: colors.muted }}>僅累加期初次月以後的帳內買進成本，並扣除帳內賣出價金。</Text>
                </>
              ) : null}
              {form === 'transaction' || form === 'valuation' ? (
                <>
                  <Text style={{ color: colors.muted }}>標的</Text>
                  <Choices>{portfolio?.positions.filter((p) => p.active).map((p) => <Choice key={p.holdingId} label={`${p.symbol ? `${p.symbol} ` : ''}${p.name}`} selected={holdingId === p.holdingId} disabled={disabled} onPress={() => setHoldingId(p.holdingId)} />)}</Choices>
                  <Field label="日期" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} disabled={disabled} />
                </>
              ) : null}
              {form === 'transaction' ? (
                <>
                  <Text style={{ color: colors.muted }}>交易類型</Text>
                  <Choices>{(Object.keys(TX_LABELS) as TxType[]).map((type) => <Choice key={type} label={TX_LABELS[type]} selected={txType === type} disabled={disabled} onPress={() => setTxType(type)} />)}</Choices>
                  <Field label={txType === 'opening' ? '期初持有成本（元）' : txType === 'buy' ? '實付成本（元）' : txType === 'sell' ? '賣出價金（元）' : '配息金額（元）'} value={amount} onChangeText={setAmount} disabled={disabled} numeric />
                  {needsQuantity ? <Field label="股數" placeholder="可填小數" value={quantity} onChangeText={setQuantity} disabled={disabled} decimal /> : null}
                  {isTrade ? (
                    <>
                      <Text style={{ color: colors.muted }}>資金來源</Text>
                      <Choices>
                        <Choice label="帳內" selected={fundSource === 'internal'} disabled={disabled} onPress={() => setFundSource('internal')} />
                        <Choice label="帳外" selected={fundSource === 'external'} disabled={disabled} onPress={() => setFundSource('external')} />
                      </Choices>
                      {fundSource === 'internal' ? (
                        <>
                          <Text style={{ color: colors.muted }}>經過的帳戶</Text>
                          <Choices>{activeAccounts.map((a) => <Choice key={a.id} label={a.name} selected={accountId === a.id} disabled={disabled} onPress={() => setAccountId(a.id)} />)}</Choices>
                          <Text style={{ color: colors.muted }}>買進扣減帳戶餘額；賣出增加帳戶餘額。不列為一般收入或支出。</Text>
                        </>
                      ) : <Text style={{ color: colors.muted }}>帳外買賣不影響帳戶餘額與累計投入淨額。</Text>}
                    </>
                  ) : <Text style={{ color: colors.muted }}>{txType === 'opening' ? '期初交易只建立持有部位，不改變帳戶餘額或期初投入額。' : '配息只記錄標的收益；若款項進入帳戶，請另外在記帳頁記一筆收入。'}</Text>}
                  <Field label="備註（選填）" value={note} onChangeText={setNote} disabled={disabled} />
                </>
              ) : null}
              {form === 'valuation' ? (
                <>
                  <Field label="時間（24 小時制）" placeholder="HH:mm" value={valuationTime} onChangeText={setValuationTime} disabled={disabled} />
                  {selected?.assetClass === 'stock' ? <Field label="每股價格（元）" value={unitPrice} onChangeText={setUnitPrice} disabled={disabled} decimal /> : <Field label="總市值（元）" value={amount} onChangeText={setAmount} disabled={disabled} numeric />}
                  <Text style={{ color: colors.muted }}>手動記錄市值，保留每次快照。台股市值由持有股數乘以每股價格計算。</Text>
                </>
              ) : null}
              <Action label="取消" disabled={saving} onPress={() => { setForm(null); setError(null); }} />
            </Card>
          ) : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={{ color: colors.income }}>{notice}</Text> : null}
          {error ? <Text accessibilityLiveRegion="polite" style={{ color: colors.expense }}>{error}</Text> : null}
        </ScrollView>
        {form ? <Pressable accessibilityRole="button" onPress={save} disabled={disabled} style={{ margin: 16, padding: 14, borderRadius: 10, alignItems: 'center', backgroundColor: colors.accent, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: '#fff', fontSize: 17, fontWeight: '600' }}>{saving ? '儲存中…' : '儲存'}</Text></Pressable> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function integerInput(value: string): number {
  return /^\d+$/.test(value) ? Number(value) : NaN;
}
function investmentMessage(error: unknown, fallback: string): string {
  return error instanceof BudgetRuleError ? error.message : userMessage(error, fallback);
}
function displayTime(value: string): string {
  // 舊 DATETIME2 沒有時區，原值就是台北時間，不以裝置所在時區重新解讀。
  if (!/(Z|[+-]\d{2}:\d{2})$/i.test(value)) return value.slice(0, 16).replace('T', ' ');
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ');
}
function Card({ title, children }: { title: string; children: ReactNode }) {
  return <View style={{ backgroundColor: colors.surface, padding: 14, borderRadius: 12, gap: 10 }}><Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>{title}</Text>{children}</View>;
}
function Amount({ value }: { value: number }) {
  return <Text style={{ color: value < 0 ? colors.expense : colors.text, fontSize: 21, fontWeight: '600' }}>{formatAmount(value)} 元</Text>;
}
function Row({ label, value }: { label: string; value: number }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: colors.muted, flexShrink: 1 }}>{label}</Text><Text style={{ color: value < 0 ? colors.expense : colors.text }}>{formatAmount(value)} 元</Text></View>;
}
function AllocationRow({ label, value, total }: { label: string; value: number; total: number }) {
  const percent = total > 0 && value >= 0 ? `${Number(BigInt(value) * 1000n / BigInt(total)) / 10}%` : '—';
  return <Row label={`${label}・${percent}`} value={value} />;
}
function Choices({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: selected ? colors.accent : colors.background, opacity: disabled ? 0.5 : 1 }}><Text style={{ color: selected ? '#fff' : colors.text }}>{label}</Text></Pressable>;
}
function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{ paddingVertical: 8, opacity: disabled ? 0.4 : 1 }}><Text style={{ color: colors.accent, fontSize: 15 }}>{label}</Text></Pressable>;
}
function Field({ label, value, onChangeText, disabled, numeric, decimal, placeholder }: { label: string; value: string; onChangeText: (value: string) => void; disabled: boolean; numeric?: boolean; decimal?: boolean; placeholder?: string }) {
  return <View style={{ gap: 6 }}><Text style={{ color: colors.muted }}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!disabled} placeholder={placeholder} autoCorrect={false} autoCapitalize="none" keyboardType={decimal ? 'decimal-pad' : numeric ? 'number-pad' : 'default'} style={{ color: colors.text, fontSize: 18, borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 }} /></View>;
}
