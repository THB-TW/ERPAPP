import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * 目前鍵盤佔用的高度（沒開鍵盤時為 0），變動時跟著鍵盤動畫一起移動。
 * 給從下方滑出的面板用：面板底部貼齊螢幕底部，所以把底部留白設成這個高度，
 * 「儲存」按鈕就會停在鍵盤上方。面板的頂端不在螢幕頂端，KeyboardAvoidingView 會算錯位置。
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      Keyboard.scheduleLayoutAnimation(event);
      setHeight(event.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, (event) => {
      Keyboard.scheduleLayoutAnimation(event);
      setHeight(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return height;
}
