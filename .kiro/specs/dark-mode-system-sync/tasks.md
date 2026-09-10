# Implementation Plan: Dark Mode System Sync

## Overview

Implement automatic, OS-driven dark mode across the Bidii web dashboard (Next.js 14 + Tailwind CSS) and mobile app (React Native / Expo + NativeWind v4). The work is divided into six parts: web infrastructure, web hardcoded color elimination, web third-party component theming, mobile infrastructure, mobile hardcoded color elimination, and cross-platform concerns. All theme switching follows the OS preference exclusively — no manual toggle in v1.

---

## Tasks

- [x] 1. Web — Semantic token CSS infrastructure
  - [x] 1.1 Update `src/app/globals.css` with all 16 semantic token CSS custom properties
    - Add `:root` block with all 16 light-mode token values (hex, matching design palette table)
    - Add `html.dark` block with all 16 dark-mode token values
    - Retain existing `--color-teal`, `--color-ink`, etc. for backward compatibility
    - Retain and verify the existing `html.dark .skeleton` shimmer keyframes (Req 5.5)
    - Add `html.dark` scoped overrides for react-datepicker (or equivalent) as specified in design §Date picker / calendar
    - Add `::placeholder` rule: `color: var(--color-muted-foreground)` (Req 13.5)
    - Add `.no-transitions *` rule suppressing all `transition-duration` to `0ms` if not already present
    - _Requirements: 2.1, 2.3, 2.7, 4.5, 5.4, 5.5, 13.1, 13.2_

  - [x] 1.2 Update `tailwind.config.js` with semantic token color utilities and confirm `darkMode: 'class'`
    - Add all 16 semantic token names under `theme.extend.colors`, each referencing its CSS variable (e.g., `background: 'var(--color-background)'`)
    - Confirm `darkMode: 'class'` is set (no change if already present, add if missing)
    - _Requirements: 2.2, 2.8_

- [x] 2. Web — ThemeProvider and ThemeScript
  - [x] 2.1 Update `src/components/ThemeProvider.tsx` — system-only theme resolution
    - Remove all `localStorage` read/write calls from `ThemeProvider`
    - Initialize theme state from `window.matchMedia('(prefers-color-scheme: dark)').matches` only
    - Add `matchMedia` `change` event listener inside a `useEffect` that calls `applyTheme` and updates state on OS change; clean up listener on unmount
    - Keep `toggle` and `setTheme` on the context value but do not wire them to any UI element
    - Wrap `matchMedia` access in existence check; fall back to `'light'` if unsupported (Req 1.7)
    - _Requirements: 1.2, 1.3, 1.5, 1.7, 14.3_

  - [x] 2.2 Update `ThemeScript` (exported from `ThemeProvider.tsx`) — localStorage-free inline script
    - Replace script body so it reads only `window.matchMedia('(prefers-color-scheme: dark)').matches`
    - Remove any `localStorage.getItem` call from the script string
    - Script applies `dark` class and `no-transitions` class on `<html>`, then removes `no-transitions` via `requestAnimationFrame` double-tick
    - Wrap entire script in `try/catch`; guard `window.matchMedia` existence before calling
    - _Requirements: 1.1, 1.4, 1.6, 4.1, 4.3, 4.5_

  - [x] 2.3 Update `src/app/layout.tsx` — hydration mismatch suppression
    - Add `suppressHydrationWarning` attribute to the `<html>` element
    - Confirm `<ThemeScript />` is rendered inside `<head>` before any other scripts
    - _Requirements: 1.4, 4.2_

  - [ ]* 2.4 Write unit tests for ThemeProvider and ThemeScript
    - Mock `window.matchMedia` returning dark → verify `html.classList.contains('dark')`
    - Fire `MediaQueryListEvent` `change` → verify class updates within test timeout
    - Mock `window.matchMedia` as `undefined` → verify no error, light theme applied
    - Render `ThemeScript` → snapshot confirms no `localStorage` reference in script content
    - _Requirements: 1.1, 1.3, 1.7_

- [x] 3. Checkpoint — Web infrastructure passing
  - Ensure all existing tests pass after ThemeProvider changes. Ask the user if questions arise.

- [x] 4. Web — Hardcoded color elimination
  - [x] 4.1 Audit and replace `bg-white` across all `src/` component files
    - Use grep pattern `\bbg-white\b` across `src/**/*.{tsx,ts,jsx,js}`
    - Replace with `bg-card` on modal/card surfaces and `bg-background` on page-level surfaces per replacement mapping table in design §Hardcoded Color Elimination
    - Zero instances of `bg-white` shall remain after replacement
    - _Requirements: 3.1_

  - [x] 4.2 Audit and replace light-only text color classes across all `src/` component files
    - Use grep patterns `\btext-black\b`, `\btext-gray-900\b`, `\btext-gray-800\b`
    - Replace all occurrences with `text-foreground`
    - Zero instances of the three classes shall remain after replacement
    - _Requirements: 3.2_

  - [x] 4.3 Audit and replace light-only background muted classes across all `src/` component files
    - Use grep patterns `\bbg-gray-50\b`, `\bbg-gray-100\b`, `\bbg-gray-200\b`
    - Replace with `bg-muted` (alternate rows, table headers, inputs) or `bg-background` as appropriate
    - Zero instances of the three classes shall remain after replacement
    - _Requirements: 3.3_

  - [x] 4.4 Audit and replace light-only border classes across all `src/` component files
    - Use grep patterns `\bborder-gray-100\b`, `\bborder-gray-200\b`, `\bborder-gray-300\b`
    - Replace all occurrences with `border-border`
    - Zero instances of the three classes shall remain after replacement
    - _Requirements: 3.4_

  - [x] 4.5 Migrate SVG icon `fill`/`stroke` hardcoded color attributes to `currentColor`
    - Use grep pattern `fill="#|stroke="#|fill="rgb|stroke="rgb` across `src/**/*.{tsx,svg}`
    - Replace hardcoded fill/stroke values with `currentColor` on icon paths
    - For icons requiring a semantic color, wrap in a parent element with the appropriate `text-*` class
    - Retain and comment brand-logo fill (`#2C7F7E`) per Req 3.7
    - Zero uncovered `fill` or `stroke` hardcoded attributes shall remain after replacement
    - _Requirements: 3.5, 3.7_

  - [x] 4.6 Replace inline `style` prop `color`/`backgroundColor` hardcoded values with Tailwind semantic utilities
    - Use grep pattern `style={{` filtered for `(color|backgroundColor).*#|rgb\(` across `src/**/*.tsx`
    - Replace qualifying inline styles with equivalent `text-*` or `bg-*` semantic token classes
    - Retain and comment chart series colors and any other exempt values per Req 3.7
    - Zero qualifying uncovered inline style color props shall remain after replacement
    - _Requirements: 3.6, 3.7_

- [x] 5. Checkpoint — Hardcoded color elimination complete
  - Run grep audits from design §Audit grep patterns to confirm zero remaining occurrences. Ensure all existing tests pass. Ask the user if questions arise.

- [ ] 6. Web — Third-party component theming
  - [ ] 6.1 Theme Recharts chart components (bar, line, pie charts)
    - Create or update `usePalette()` helper in chart components that reads CSS variable values via `getComputedStyle`
    - Pass `tickColor`, `gridColor`, `tooltipBg`, `tooltipFg`, `legendFg` props to `CartesianGrid`, `XAxis`, `YAxis`, `Tooltip`, `Legend`
    - Hardcode chart series colors from `CHART_SERIES` constant (created in task 11.1) with required comment
    - _Requirements: 5.1, 12.1, 12.2, 12.5, 12.6_

  - [ ] 6.2 Theme timetable grid component
    - Replace hardcoded cell background and border colors with `bg-card border-border` classes
    - Apply `text-card-foreground` to subject, teacher, and room label text
    - Apply `bg-card border-border` to empty cells
    - _Requirements: 12.3, 12.4, 12.8_

  - [ ] 6.3 Theme modal and dialog overlay components
    - Replace `bg-white` / `bg-gray-*` on modal content wrappers with `bg-card text-card-foreground`
    - Keep backdrop scrim as `bg-black/50` (works in both themes)
    - _Requirements: 5.2_

  - [ ] 6.4 Theme toast and snackbar notification components
    - Replace hardcoded background with `bg-card text-card-foreground border border-border shadow-lg`
    - _Requirements: 5.3_

  - [ ] 6.5 Theme PDF preview component wrapper
    - Wrap iframe/canvas in `<div className="bg-card rounded-lg overflow-hidden">`
    - _Requirements: 5.7_

  - [ ] 6.6 Create `src/components/Logo.tsx` with dark/light logo variant swap
    - Render two `<img>` elements: light logo with `className="block dark:hidden"`, dark logo with `className="hidden dark:block"`
    - Add `onError` handler on dark logo that falls back to default logo and logs error (Req 11.6)
    - _Requirements: 11.1, 11.3, 11.6_

- [ ] 7. Checkpoint — Web third-party theming complete
  - Visually verify charts, modals, toasts, date picker, skeleton, and PDF preview in dark mode. Ensure all existing tests pass. Ask the user if questions arise.

- [x] 8. Mobile — Core theme infrastructure
  - [x] 8.1 Update `mobile/app.json` — native UI chrome automatic theming
    - Set `"userInterfaceStyle": "automatic"` in the Expo config
    - _Requirements: 6.1_

  - [x] 8.2 Create `mobile/constants/colors.ts` — typed color token file
    - Define `ColorTokens` interface with all 17 required keys (camelCase)
    - Define `light` and `dark` objects satisfying `ColorTokens`, with hex values from design §Semantic Token Palette
    - Verify `dark.background === '#0D1B2A'`, `dark.card === '#162233'`, `dark.border === '#1E3347'`
    - Verify `light.background === '#FAFBFC'`, `light.card === '#FFFFFF'`, `light.border === '#E8EDF2'`
    - Export `getColors(scheme: 'light' | 'dark'): ColorTokens` returning the correct module-level constant
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 8.3 Write property-based test — Property 2: Token schema completeness
    - **Property 2: Color token schema completeness**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.5, 8.7**
    - Use `fc.constantFrom('light', 'dark')` to drive scheme; assert all 17 keys present and each value matches `^#[0-9A-Fa-f]{6}$`
    - Run with `numRuns: 100`

  - [ ]* 8.4 Write property-based test — Property 3: getColors scheme routing
    - **Property 3: getColors scheme routing**
    - **Validates: Requirements 8.4, 7.2, 7.3**
    - Assert `background` anchor values per scheme; assert `getColors(scheme) === getColors(scheme)` (referential stability)
    - Run with `numRuns: 100`

  - [ ]* 8.5 Write property-based test — Property 1: WCAG AA contrast compliance
    - **Property 1: WCAG AA contrast compliance across all required token pairs**
    - **Validates: Requirements 2.4, 2.5, 13.1, 13.2, 13.6, 13.7, 13.11**
    - Implement `relativeLuminance` and `contrastRatio` helpers
    - Assert ≥ 4.5:1 for all 14 normal-text pairs; assert ≥ 3:1 for the 2 muted pairs
    - Use `fc.constant(null)` driver, iterate over fixed pair arrays; `numRuns: 100`

  - [x] 8.6 Create `mobile/lib/ThemeContext.tsx` — ThemeProvider and useTheme hook
    - Implement `ThemeProvider` component: reads `useColorScheme()`, initializes state, adds `Appearance.addChangeListener` in `useEffect` (cleaned up on unmount), wraps listener in try/catch for old SDK safety
    - `resolveScheme` defaults anything other than `'dark'` to `'light'`
    - Memoize context value with `useMemo` keyed on `scheme`; call `getColors(scheme)` for `colors`
    - Export `useTheme()` that throws if called outside a provider
    - _Requirements: 6.2, 6.3, 6.6, 7.1, 7.4, 7.5, 7.6, 7.7_

  - [ ]* 8.7 Write unit tests for ThemeContext
    - `renderHook(() => useTheme())` with mocked `useColorScheme` returning `null` → verify `scheme === 'light'`
    - Fire `Appearance.addChangeListener` callback with `'dark'` → verify `scheme` updates
    - Call `useTheme()` outside provider → verify error thrown
    - _Requirements: 6.2, 6.6, 7.4_

  - [ ]* 8.8 Write property-based test — Property 4: useTheme reference stability
    - **Property 4: useTheme reference stability**
    - **Validates: Requirements 7.7**
    - Mock `useColorScheme` to fixed scheme; rerender; assert `Object.is(first, second)` is true
    - Run with `numRuns: 100`

  - [x] 8.9 Update `mobile/app/_layout.tsx` — wrap navigation tree with ThemeProvider
    - Import `ThemeProvider` from `@/lib/ThemeContext`
    - Wrap existing navigation root with `<ThemeProvider>` as the outermost provider after `GestureHandlerRootView` / `SafeAreaProvider`
    - Set `<StatusBar style="auto" />` from `expo-status-bar`
    - _Requirements: 6.5, 7.5_

  - [x] 8.10 Update `mobile/tailwind.config.js` — dark mode media and semantic token utilities
    - Add `darkMode: 'media'` at the top level of the config
    - Add all 16 semantic token names under `theme.extend.colors` with their light-mode hex values
    - _Requirements: 9.1_

  - [x] 8.11 Create or update `mobile/global.css` — dark mode CSS variable declarations
    - Add `:root` block with all 16 light-mode token CSS variables
    - Add `@media (prefers-color-scheme: dark)` block overriding all 16 variables with dark-mode values
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 9. Checkpoint — Mobile infrastructure passing
  - Run mobile test suite. Ensure ThemeContext, colors.ts, and layout wiring all pass. Ask the user if questions arise.

- [ ] 10. Mobile — Hardcoded color elimination
  - [ ] 10.1 Audit and replace hardcoded colors in `StyleSheet.create()` calls
    - Grep `mobile/` for `backgroundColor:.*'#|color:.*'#` in `.tsx` and `.ts` files
    - Replace each hardcoded color with `useTheme().colors.<token>` (or accept `colors` from `useTheme()` in the component and reference the token)
    - _Requirements: 9.5_

  - [ ] 10.2 Audit and replace hardcoded colors in inline `style` props
    - Grep `mobile/` for `style={{` containing hex color literals
    - Replace with `useTheme().colors.<token>` references
    - _Requirements: 9.5_

  - [ ] 10.3 Add missing `dark:` variant pairs to all NativeWind `className` props
    - Grep `mobile/` for NativeWind `className` props containing light-only utilities without a `dark:` counterpart
    - Add the corresponding `dark:` utility using semantic token values per design §className pairing convention
    - _Requirements: 9.4_

  - [ ] 10.4 Update modal components — themed card background
    - Replace hardcoded background on `<Modal>` content views with `backgroundColor: colors.card` from `useTheme()`
    - Keep overlay scrim as `rgba(0,0,0,0.5)` per design §Imperative modal / bottom sheet theming
    - _Requirements: 10.1, 10.2, 10.5_

  - [ ] 10.5 Update bottom sheet components — themed surface background
    - Replace hardcoded background on bottom sheet container with `backgroundColor: colors.card`
    - Apply `colors.mutedForeground` to the drag indicator
    - _Requirements: 10.3, 10.4, 10.5_

  - [ ] 10.6 Create `mobile/components/Logo.tsx` — dark/light logo asset swap
    - Import `LOGO_LIGHT` and `LOGO_DARK` from assets
    - Read `scheme` from `useTheme()` and conditionally pass the correct `source`
    - Set `defaultSource={LOGO_LIGHT}` as fallback (Req 11.7)
    - _Requirements: 11.2, 11.4, 11.7_

- [ ] 11. Checkpoint — Mobile hardcoded color elimination complete
  - Run full mobile test suite, verify no remaining unthemed colors in grep audit. Ask the user if questions arise.

- [ ] 12. Cross-platform — Shared constants, assets, and audit tests
  - [x] 12.1 Create shared `CHART_SERIES` constant
    - Add `export const CHART_SERIES = [...]` with the 6 series colors from design §Chart series colors
    - Add the required contrast verification comment block above the array
    - Place in `src/lib/chartColors.ts` (web) and reference from chart components; mobile can import from a shared location or duplicate with comment
    - _Requirements: 12.6, 3.7_

  - [ ] 12.2 Export dark-safe logo assets
    - Place `logo-dark.png` in `public/` (web) — wordmark with any white elements replaced by `#E8EDF2`, achieving ≥ 3:1 against `#162233`
    - Place `logo-dark.png` in `mobile/assets/` (mobile)
    - _Requirements: 11.1, 11.2, 11.5_

  - [ ] 12.3 Add axe-core Playwright contrast audit tests
    - Install `axe-core` and `@axe-core/playwright` as dev dependencies
    - Create `tests/a11y/contrast.spec.ts` iterating over the 8 required screens × 2 color scheme modes
    - Each test calls `page.emulateMedia({ colorScheme })`, navigates, and calls `checkA11y` with `color-contrast` rule enabled
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.11, 13.12, 15.1, 15.2, 15.3, 15.4_

  - [x] 12.4 Create `dark-mode-readme.md` documenting semantic tokens and usage patterns
    - Document all 16 web CSS token names, their Tailwind utility equivalents, and light/dark hex values
    - Document `useTheme()` hook API for mobile
    - Document the `dark:` variant pairing convention for NativeWind
    - Document which colors are exempt from token replacement (brand logo, chart series) and why
    - _Requirements: 15.1, 15.3_

- [ ] 13. Final checkpoint — All parts complete
  - Run full web and mobile test suites. Run axe-core Playwright audit against all 8 screens in both modes. Confirm zero grep audit failures. Ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP delivery
- Property tests (8.3, 8.4, 8.5, 8.8) use **fast-check** with `numRuns: 100` as specified in the design
- The design already sets `darkMode: 'class'` on web and `darkMode: 'media'` on mobile — these are intentionally different by platform (see design §Key design decisions)
- Requirement 1.8 (retain saved localStorage preference over OS change) is intentionally NOT implemented in v1 per Req 14.5 and the design decision to remove localStorage entirely from ThemeProvider; Req 1.8 is superseded by Req 14 (no manual toggle) in v1
- The `no-transitions` CSS class must be defined in `globals.css` before task 2.2 is executed
- Logo dark-safe assets (task 12.2) may need to be created by a designer before task 6.6 / 10.6 can be fully integrated; placeholder assets are acceptable for initial implementation
- Each task references specific requirements for traceability

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "8.1", "8.2", "12.1"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "8.3", "8.4", "8.5", "8.10", "8.11"] },
    { "id": 2, "tasks": ["2.4", "4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "8.6"] },
    { "id": 3, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5", "6.6", "8.7", "8.8", "8.9"] },
    { "id": 4, "tasks": ["10.1", "10.2", "10.3", "10.4", "10.5", "10.6", "12.2"] },
    { "id": 5, "tasks": ["12.3", "12.4"] }
  ]
}
```
