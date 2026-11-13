import { NativeTabs } from 'expo-router/native-tabs';
import { grouped } from '../../ui/theme.ts';

// 底部五個分頁（依原型第五版）：記帳、明細、預算、月結、設定。
// 使用 iOS 原生分頁列（UITabBarController）：iOS 26 起由系統畫 Liquid Glass 背景，圖示用 SF Symbols，
// 選取時換成實心版本。各分頁是本資料夾下的同名子資料夾（記帳是 (home)），各自有一層原生堆疊負責標題。
// 原生分頁列不能在執行時增減分頁，五個分頁固定寫在這裡。
export default function TabLayout() {
  return (
    <NativeTabs tintColor={grouped.accent}>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.and.pencil', selected: 'square.and.pencil' }} />
        <NativeTabs.Trigger.Label>記帳</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="report">
        <NativeTabs.Trigger.Icon sf={{ default: 'chart.pie', selected: 'chart.pie.fill' }} />
        <NativeTabs.Trigger.Label>明細</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="budget">
        <NativeTabs.Trigger.Icon sf={{ default: 'list.bullet.rectangle', selected: 'list.bullet.rectangle.fill' }} />
        <NativeTabs.Trigger.Label>預算</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="close">
        <NativeTabs.Trigger.Icon sf={{ default: 'checkmark.seal', selected: 'checkmark.seal.fill' }} />
        <NativeTabs.Trigger.Label>月結</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
        <NativeTabs.Trigger.Label>設定</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
