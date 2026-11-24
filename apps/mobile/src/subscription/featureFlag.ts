// 訂閱總開關。false＝先不做訂閱：進階功能對所有人全開，設定頁不顯示「訂閱」，也沒有付費提示或試用畫面。
// 訂閱程式碼都保留；上架前（Apple Developer、StoreKit 轉接層、商品都就緒後）把它改成 true。
// 這個值由 subscription.test.ts 檢查：改成 true 之前，上架清單會提醒。
export const SUBSCRIPTION_ENABLED = false;
