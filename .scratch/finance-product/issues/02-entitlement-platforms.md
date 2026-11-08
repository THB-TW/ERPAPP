# 比較訂閱權益驗證與網頁收款方案的成本

Type: research
Labels: wayfinder:research
Status: open

## Question

iOS 與網頁共用一份訂閱權益，有哪些可行做法、各自成本與工作量？
- 自建：StoreKit 2 + App Store Server API / Server Notifications V2，在 Cloudflare Workers 驗證交易。
- 代管：RevenueCat（含 Web Billing）、Adapty 等的費率與免費門檻。
- 網頁收款：Stripe 在台灣是否可開帳號；台灣在地金流（綠界 ECPay、藍新 NewebPay、TapPay）定期定額訂閱的費率、電子發票義務。
- Expo SDK 58 下可用的 IAP 套件（expo-iap、react-native-purchases 等）與 dev build 需求。
附官方價目連結與查證日期，換算 NT$ 時寫明假設匯率。
