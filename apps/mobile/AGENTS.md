This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## UI 風格（本專案）

畫面採 Apple「分組清單」風格：淺灰底、白色圓角卡片、Apple 字級、克制使用強調色。新畫面或改畫面時：

- 配色與字級只用 `src/ui/theme.ts` 的 `colors`、`typeScale`，不要直接寫色碼或字級。
- 版面用 `src/ui/kit.tsx` 的零件（`Card`、`Group`、`Row`、`NavRow`、`SectionTitle`、`Footnote`、`MonthBar`、`PrimaryButton`、`Segmented`、`Chip`、`Banner`）與 `kit.*`／`text.*` 樣式；規則寫在該檔開頭。參考畫面：`src/app/(tabs)/budget/index.tsx`。
- 分頁在 `src/app/(tabs)/<分頁>/index.tsx`（記帳是 `(home)/`），底部是原生分頁列（`expo-router/native-tabs`），每個分頁一個不透明導覽列（`src/ui/TabStack.tsx`）。
- 分頁大標題**不用**原生 `headerLargeTitleEnabled`：iOS 26 導覽列有底色時，原生大標題收合後小標題看不見（模擬器實測）。改用 `src/ui/LargeTitle.tsx`：一般分頁最外層用 `<TabScrollView title=…>`；需要自己的 ScrollView（例如預算頁的吸頂頁籤）就用 `useLargeTitle()`，把 `element` 放第一項、`onScroll` 接上。
- `stickyHeaderIndices` 指到的子節點外面要多包一層沒樣式的 `View`：React Native 會把吸頂子節點的樣式搬到它自己的外框，橫排會變直排。
- 頁內不要再放和導覽列同名的標題。
- 長頁面的區段跳轉用 `src/ui/sectionNav.ts`。
- 記帳、轉帳表單以 iOS 面板（modal）呈現；面板裡不要用 `KeyboardAvoidingView`，用 `src/ui/useKeyboardHeight.ts`。
