# Requirements Document

## Introduction

This feature delivers automatic, system-synced dark mode across Bidii's web dashboard
(Next.js 14 + Tailwind CSS) and mobile application (React Native / Expo + NativeWind).
Dark mode follows the device or OS appearance setting automatically — no manual
toggle is provided in v1. Every text label, icon, border, input, chart, and
third-party element must remain clearly legible in both themes, satisfying WCAG AA
contrast at all times. The implementation must match the visibility standard of apps
like Instagram: zero invisible or low-contrast elements in either mode.

Scope is limited to theming and contrast. Auth, RBAC, PgBouncer, M-Pesa, and
database logic are out of scope.

---

## Glossary

- **Web_App**: The Bidii school management dashboard built with Next.js 14 and
  Tailwind CSS.
- **Mobile_App**: The Bidii mobile app built with React Native, Expo, and NativeWind.
- **Theme_Provider**: The client-side React context component in the Web_App
  (currently `src/components/ThemeProvider.tsx`) responsible for applying the active
  theme class to the `<html>` element.
- **Theme_Context**: The React context in the Mobile_App that exposes the active
  color scheme and the resolved token palette via a `useTheme()` hook.
- **Semantic_Token**: A named color variable whose value differs between light and
  dark mode (e.g. `--color-background`, `--color-foreground`). Semantic tokens
  abstract away raw hex values so components never need per-mode branches.
- **System_Scheme**: The dark/light preference reported by the host OS
  (`prefers-color-scheme` on web; `useColorScheme` / `Appearance` on React Native).
- **Hardcoded_Color**: Any color value specified as a raw hex, RGB string, or
  mode-specific Tailwind utility (e.g. `bg-white`, `text-black`, `fill="#000"`)
  without a paired dark-mode counterpart.
- **WCAG_AA**: Web Content Accessibility Guidelines 2.1 Level AA contrast requirements:
  4.5:1 contrast ratio for normal text (< 18 pt or < 14 pt bold), 3:1 for large
  text and UI component boundaries.
- **Flash_of_Wrong_Theme (FOWT)**: The momentary render of the incorrect theme on
  initial page load before client-side JavaScript executes.
- **Color_Scheme_Listener**: The `Appearance.addChangeListener` callback in the
  Mobile_App that detects OS-level theme changes while the app is running.
- **StatusBar**: The Expo `StatusBar` component controlling the system status bar
  appearance on iOS and Android.
- **NativeWind**: The utility-CSS framework for React Native that mirrors Tailwind
  class names. The Mobile_App uses NativeWind v4.
- **Recharts**: The charting library used in the Web_App for fee/M-Pesa payment
  and timetable visualizations.
- **ThemeScript**: The inline `<script>` injected into `<head>` by the Web_App that
  reads the saved preference before React hydration to prevent FOWT.

---

## Requirements

---

### Requirement 1: Web — System-Driven Theme Resolution

**User Story:** As a school administrator using the Bidii web dashboard, I want the
interface to automatically display in dark or light mode matching my OS setting so
that I do not have to configure anything manually.

#### Acceptance Criteria

1. WHEN the OS `prefers-color-scheme` is `dark` and no saved user preference exists, THE Theme_Provider SHALL apply the `dark` class to the `<html>` element before the first paint.
2. WHEN the OS `prefers-color-scheme` is `light` and no saved user preference exists, THE Theme_Provider SHALL apply no dark class to the `<html>` element and ensure no residual `dark` class remains on the `<html>` element from a prior session.
3. WHEN the OS appearance setting changes while the browser tab is open, THE Theme_Provider SHALL update the active theme class on the `<html>` element within 300 ms without requiring a page reload.
4. THE ThemeScript SHALL execute synchronously in `<head>` before React hydration so that the correct theme class is present on the first rendered frame.
5. IF localStorage is unavailable (private browsing, security policy), THEN THE Theme_Provider SHALL fall back to the System_Scheme without throwing a JavaScript error.
6. THE Web_App SHALL suppress all CSS transition animations during the initial theme class application to eliminate Flash_of_Wrong_Theme.
7. IF the OS `prefers-color-scheme` media query is not supported by the browser, THEN THE Theme_Provider SHALL apply the `light` theme as the default and proceed without throwing a JavaScript error.
8. WHEN the OS appearance setting changes while the browser tab is open and a saved user preference exists in localStorage, THE Theme_Provider SHALL retain the saved user preference and SHALL NOT override it with the new System_Scheme.

---

### Requirement 2: Web — Semantic Color Token System

**User Story:** As a front-end developer maintaining the Bidii dashboard, I want a
complete set of semantic color tokens so that components automatically inherit the
correct colors in both modes without per-component dark-mode branches.

#### Acceptance Criteria

1. THE Web_App SHALL define the following Semantic_Token CSS custom properties in `globals.css` under `:root` (light) and `html.dark` (dark): `--color-background`, `--color-foreground`, `--color-card`, `--color-card-foreground`, `--color-border`, `--color-input`, `--color-muted`, `--color-muted-foreground`, `--color-primary`, `--color-primary-foreground`, `--color-destructive`, `--color-destructive-foreground`, `--color-success`, `--color-success-foreground`, `--color-warn`, `--color-warn-foreground`; each token SHALL have a non-empty CSS color value expressed as a valid CSS color (hex, rgb(), hsl(), or named color) in both `:root` and `html.dark`, and no token value SHALL be `inherit`, `initial`, `unset`, or an empty string.
2. THE `tailwind.config.js` SHALL expose all 16 Semantic_Tokens as Tailwind color utilities under the `theme.colors` or `theme.extend.colors` key, each referencing its corresponding CSS variable (e.g. `background: 'var(--color-background)'`), such that all 16 utilities are present in the config and each utility name matches the token name with the `--color-` prefix removed.
3. WHEN a Semantic_Token is used in a component, THE Web_App SHALL render the correct token value for the active theme — verified by toggling the `dark` class on `<html>` and confirming the computed color changes to the `html.dark` value within 100ms — without any additional component-level media query or dark-class conditional.
4. THE Semantic_Token values for the dark theme SHALL maintain a WCAG_AA contrast ratio of at least 4.5:1 between `--color-foreground` and `--color-background`, and at least 4.5:1 between `--color-card-foreground` and `--color-card`, and at least 3:1 between `--color-muted-foreground` and `--color-muted`, as measured by a conformant contrast-ratio tool against the resolved CSS color values.
5. THE Semantic_Token values for the light theme SHALL maintain a WCAG_AA contrast ratio of at least 4.5:1 between `--color-foreground` and `--color-background`, and at least 4.5:1 between `--color-card-foreground` and `--color-card`, and at least 3:1 between `--color-muted-foreground` and `--color-muted`, as measured by a conformant contrast-ratio tool against the resolved CSS color values.
6. IF a Semantic_Token CSS variable is referenced in a component but is undefined or resolves to an empty value, THEN THE Web_App SHALL render the affected element using a visible fallback color defined alongside the token reference such that the element remains distinguishable against both light and dark backgrounds, and no element SHALL become invisible or indistinguishable from its immediate background.
7. WHEN the `dark` class is added to or removed from `<html>`, THE Web_App SHALL apply all updated Semantic_Token values within the same browser paint cycle such that no element is rendered with a stale token value from the previous theme at any point after the class change is committed to the DOM.
8. THE Web_App SHALL define at least one Tailwind utility class pairing for each semantic role — specifically `text-foreground`/`bg-background`, `text-card-foreground`/`bg-card`, `text-primary-foreground`/`bg-primary`, `text-destructive-foreground`/`bg-destructive`, `text-success-foreground`/`bg-success`, and `text-warn-foreground`/`bg-warn` — such that each foreground utility applied to text on its corresponding background utility satisfies the 4.5:1 WCAG_AA contrast ratio in both themes.

---

### Requirement 3: Web — Hardcoded Color Elimination

**User Story:** As a developer auditing the Bidii dashboard, I want all components
to use Semantic_Tokens instead of Hardcoded_Colors so that no element is invisible
or low-contrast in dark mode.

#### Acceptance Criteria

1. THE Web_App SHALL replace every occurrence of `bg-white` with `bg-card` or `bg-background` (whichever is semantically correct) across all component files, such that zero instances of `bg-white` remain in any `.tsx`, `.jsx`, `.ts`, or `.js` component file after the change.
2. THE Web_App SHALL replace every occurrence of `text-black`, `text-gray-900`, and `text-gray-800` with `text-foreground` or an equivalent Semantic_Token, such that zero instances of those three classes remain in any component file after the change.
3. THE Web_App SHALL replace every occurrence of `bg-gray-50`, `bg-gray-100`, and `bg-gray-200` with `bg-muted` or `bg-background` as appropriate, such that zero instances of those three classes remain in any component file after the change.
4. THE Web_App SHALL replace every occurrence of `border-gray-100`, `border-gray-200`, and `border-gray-300` with `border-border`, such that zero instances of those three classes remain in any component file after the change.
5. WHEN an SVG icon contains a `fill` or `stroke` attribute whose value is a Hardcoded_Color (any hex literal, `rgb()`, or named color other than `currentColor` or `none`), THE Web_App SHALL replace that attribute value with `currentColor` so the icon inherits the parent text color token, such that zero SVG `fill` or `stroke` attributes with Hardcoded_Color values remain in any component file after the change.
6. WHEN a component contains an inline `style` prop whose `color` or `backgroundColor` value is a Hardcoded_Color (any hex literal, `rgb()`, or named color), THE Web_App SHALL replace that prop with the equivalent Semantic_Token-based Tailwind class, such that zero such inline `style` props with Hardcoded_Color values remain in any component file after the change.
7. IF a Hardcoded_Color cannot be replaced by a Semantic_Token (e.g. brand logo fill, chart series color), THEN THE Web_App SHALL retain that color only when both of the following are true: (a) a code comment on the same line or the immediately preceding line documents the reason the color is intentional, and (b) the color achieves a contrast ratio of at least 4.5:1 against its background in both light mode and dark mode as defined by WCAG_AA for normal text, or 3:1 for large text and UI components.
8. WHEN the Hardcoded_Color elimination task is complete, THE Web_App SHALL render every page in dark mode without any text, icon, or interactive control appearing fully invisible (i.e., foreground color must not equal or be within 5% luminance of the background color in the same region).

---

### Requirement 4: Web — No Flash of Wrong Theme

**User Story:** As a user opening the Bidii dashboard, I want the correct light or
dark mode to appear immediately on page load so that I never see a brief white
flash before the theme applies.

#### Acceptance Criteria

1. THE ThemeScript SHALL read `localStorage.getItem('bidii_theme')` and `window.matchMedia('(prefers-color-scheme: dark)').matches` synchronously before the first paint and apply or remove the `dark` class on `<html>` prior to any visible rendering.
2. THE Web_App SHALL render the `<html>` element with hydration mismatch suppression so that a server-rendered class differing from the client-applied class produces no error or warning visible to the end user.
3. WHEN the Web_App is loaded with the OS in dark mode, THE Web_App SHALL apply the `dark` class on `<html>` such that no white background is visible for more than 16 ms after the first paint begins.
4. IF `localStorage.getItem('bidii_theme')` returns null and `window.matchMedia('(prefers-color-scheme: dark)').matches` returns false, THEN THE ThemeScript SHALL apply the light theme by default.
5. THE Web_App SHALL suppress theme-transition animations during initial theme application and re-enable them within 34 ms (≤ 2 frames at 60 Hz) so that subsequent user-triggered theme changes animate normally.
6. WHEN the user reloads the page, THE Web_App SHALL apply the same theme that was active before the reload without any visible flash.

---

### Requirement 5: Web — Third-Party and Embedded Component Compatibility

**User Story:** As a school administrator, I want charts, date pickers, modals,
toasts, and PDF previews to also respect dark mode so that no element in the
application looks visually broken in either theme.

#### Acceptance Criteria

1. WHEN the active theme is dark, THE Recharts components (bar charts, line charts, pie charts) SHALL render axis labels, legend text, tooltip backgrounds, and grid lines using dark-mode Semantic_Token values such that no axis label, legend entry, or grid line has a contrast ratio below 3:1 against its immediate background.
2. WHEN the active theme is dark, THE modal and dialog overlays SHALL use `--color-card` as their background and `--color-card-foreground` as their text color, achieving a contrast ratio of at least 4.5:1 between text and background.
3. WHEN the active theme is dark, THE toast and snackbar notifications SHALL use `--color-card` as their background and `--color-card-foreground` as their text color, achieving a contrast ratio of at least 4.5:1 between notification text and background.
4. WHEN the active theme is dark, THE date picker or calendar component SHALL render all day numbers, month headers, and navigation icons with a contrast ratio of at least 4.5:1 against the dark background, and selected-day indicators SHALL maintain a contrast ratio of at least 3:1 against adjacent non-selected cells.
5. WHEN the active theme is dark, THE skeleton/loading placeholder components SHALL use `--color-muted` as the shimmer base color and a variant at least 15% lighter in perceived luminance as the highlight color, so that the shimmer animation produces a visible sweep across the placeholder.
6. IF a third-party component does not expose a theme prop, THEN THE Web_App SHALL apply a CSS class override scoped to `html.dark` that targets the component's internal class names and corrects all contrast failures to a minimum ratio of 4.5:1 for text and 3:1 for non-text UI elements.
7. WHEN the active theme is dark, THE PDF preview component SHALL render with a background color of `--color-card` and document text color of `--color-card-foreground`, ensuring the preview frame does not display an unthemed white canvas inside a dark-mode layout.

---

### Requirement 6: Mobile — Automatic System Scheme Detection

**User Story:** As a student or teacher using the Bidii mobile app, I want the app
to display in dark or light mode matching my phone's OS setting automatically so
that I experience consistent visual comfort without manual configuration.

#### Acceptance Criteria

1. THE `app.json` SHALL set `"userInterfaceStyle": "automatic"` so the OS controls the native UI chrome (status bar, navigation bar, keyboards) automatically.
2. THE Theme_Context SHALL initialize by reading `useColorScheme()` to determine the initial System_Scheme on first render, defaulting to `"light"` if `useColorScheme()` returns `null`.
3. WHEN the OS appearance changes while the Mobile_App is in the foreground, THE Color_Scheme_Listener SHALL trigger an update to the Theme_Context within one render cycle so all subscribed components re-render with the new palette within 100 milliseconds.
4. WHEN the Mobile_App is backgrounded and then foregrounded after the OS scheme has changed, THE Theme_Context SHALL reflect the new System_Scheme on the next render after the app becomes active, within 100 milliseconds of the app returning to the foreground.
5. THE StatusBar SHALL use `style="auto"` from `expo-status-bar` so the status bar icons automatically invert between light and dark.
6. IF `useColorScheme()` returns a value other than `"light"` or `"dark"`, THEN THE Theme_Context SHALL default to `"light"` scheme and continue normal operation without error.
7. WHILE the Mobile_App is active, THE Theme_Context SHALL ensure that every subscribed component receives the same System_Scheme value so no component displays a scheme inconsistent with the current OS appearance.

---

### Requirement 7: Mobile — Theme Context and useTheme Hook

**User Story:** As a React Native developer working on Bidii mobile screens, I want
a single `useTheme()` hook that provides the current color palette so that no screen
component needs to branch on color scheme manually.

#### Acceptance Criteria

1. THE Theme_Context SHALL export a `useTheme()` hook that returns an object with shape `{ scheme: 'light' | 'dark', colors: ColorTokens }` where `ColorTokens` is the type of the resolved palette for the active scheme.
2. IF `scheme === 'light'`, THEN THE `useTheme()` hook SHALL return the light palette values for the `colors` field.
3. IF `scheme === 'dark'`, THEN THE `useTheme()` hook SHALL return the dark palette values for the `colors` field.
4. WHEN `useTheme()` is called outside of a `ThemeContext.Provider`, THE hook SHALL throw an error indicating that the hook must be used within a ThemeProvider.
5. THE Theme_Context Provider SHALL be mounted at the root of the Mobile_App's navigation tree so every screen and modal has access to the theme context.
6. WHEN the active color scheme changes, THE Theme_Context Provider SHALL supply the updated `scheme` and `colors` values to all consumers, causing exactly those components to re-render.
7. WHILE the active color scheme has not changed, THE `useTheme()` hook SHALL return the same object reference so that components that depend only on theme values do not re-render due to unrelated state updates in ancestor components.

---

### Requirement 8: Mobile — Color Token File

**User Story:** As a developer, I want a typed `colors.ts` token file for the
Mobile_App that mirrors the web Semantic_Tokens with explicit light and dark
variants so that all imperative style usage (StyleSheet.create, inline styles)
references the same design system.

#### Acceptance Criteria

1. THE `colors.ts` token file SHALL define a `light` object and a `dark` object each containing exactly the following 17 keys with values expressed as 6-digit hex strings (`#RRGGBB`): `background`, `foreground`, `card`, `cardForeground`, `border`, `input`, `muted`, `mutedForeground`, `primary`, `primaryForeground`, `destructive`, `destructiveForeground`, `success`, `successForeground`, `warn`, `warnForeground`, `placeholder`.
2. THE `dark.background` value SHALL be `#0D1B2A`, `dark.card` SHALL be `#162233`, and `dark.border` SHALL be `#1E3347`, matching the existing dark surface tokens already defined in `globals.css`.
3. THE `light.background` value SHALL be `#FAFBFC`, `light.card` SHALL be `#FFFFFF`, and `light.border` SHALL be `#E8EDF2`, matching the existing light tokens.
4. THE `colors.ts` file SHALL export a `getColors(scheme: 'light' | 'dark')` helper that returns the correct object for the given scheme so Theme_Context can call it with the resolved System_Scheme.
5. WHEN a developer imports `colors.ts` in a component, THE TypeScript compiler SHALL infer all 17 exact token key names without `any` casts, providing autocomplete for all token keys.
6. IF a value other than `'light'` or `'dark'` is passed to `getColors`, THEN THE TypeScript compiler SHALL reject the call at compile time, without requiring a runtime check.
7. IF either the `light` or `dark` object in `colors.ts` is missing any of the 17 required keys, THEN THE TypeScript compiler SHALL emit a type error, preventing the file from being used in a build that passes type checking.

---

### Requirement 9: Mobile — NativeWind Dark Mode Configuration

**User Story:** As a developer, I want NativeWind to use `darkMode: 'media'` so that
Tailwind dark-variant classes (e.g. `dark:bg-dark-bg`) automatically apply when the
OS is in dark mode, without any manual class toggling.

#### Acceptance Criteria

1. THE `mobile/tailwind.config.js` SHALL include `darkMode: 'media'` at the top level of the config object.
2. WHEN the OS scheme changes to dark, THE NativeWind runtime SHALL apply all `dark:*` utility classes to matching components within 100 ms, without any JavaScript intervention.
3. WHEN the OS scheme changes to light, THE NativeWind runtime SHALL remove all `dark:*` utility classes from matching components within 100 ms, without any JavaScript intervention.
4. THE Mobile_App SHALL pair every light-only utility (e.g. `bg-card`, `text-ink`, `border-line`) used in NativeWind `className` props with a corresponding `dark:` variant (e.g. `dark:bg-dark-surface`, `dark:text-dark-text`, `dark:border-dark-border`); any light-only utility present without a `dark:` counterpart SHALL cause the build verification step to fail.
5. WHEN a `StyleSheet.create()` call or inline style contains a Hardcoded_Color that differs across themes, THE Mobile_App SHALL replace it with the corresponding value from `useTheme().colors` so the resolved color matches the active OS color scheme within 100 ms of a scheme change.
6. IF `useTheme().colors` does not contain a mapped value for a given Hardcoded_Color, THEN THE Mobile_App SHALL emit a build-time warning identifying the affected file and line number, and the missing token SHALL be added to the theme configuration before the change is considered complete.

---

### Requirement 10: Mobile — Native Modal and Bottom Sheet Compatibility

**User Story:** As a user, I want modals, bottom sheets, and the keyboard overlay
to display in dark mode when my OS is in dark mode so that I do not encounter
a jarring white surface in an otherwise dark interface.

#### Acceptance Criteria

1. WHEN the OS color scheme is dark, THE Mobile_App's modal overlay surfaces SHALL use the active theme's card background color token for their background.
2. WHEN the OS color scheme is light, THE Mobile_App's modal overlay surfaces SHALL use the active theme's card background color token for their background.
3. WHEN the OS color scheme is dark, THE Mobile_App's bottom sheet surfaces SHALL use the active theme's card background color token for their surface background.
4. WHEN the OS color scheme is light, THE Mobile_App's bottom sheet surfaces SHALL use the active theme's card background color token for their surface background.
5. WHEN a modal or bottom sheet is open, THE Mobile_App's overlay scrim SHALL use a semi-transparent dark color in both light and dark OS color schemes to maintain consistent depth perception.
6. WHEN the OS color scheme is dark, THE Mobile_App SHALL configure the system keyboard to display in dark appearance on both iOS and Android platforms.

---

### Requirement 11: Cross-Platform — Brand Asset Dark-Mode Safety

**User Story:** As a product designer, I want the Bidii logo and icon assets to
remain visible in both light and dark mode so that brand identity is preserved
across themes.

#### Acceptance Criteria

1. THE Web_App SHALL provide a dark-mode-safe logo variant that achieves a contrast ratio of ≥ 3:1 between the logo fill color and the card background color (`--color-card`) in dark mode, as measured by the WCAG contrast algorithm.
2. THE Mobile_App SHALL provide a dark-mode-safe logo variant and a dark-mode-safe icon asset, each achieving a contrast ratio of ≥ 3:1 against their respective background colors in dark mode, as measured by the WCAG contrast algorithm.
3. WHEN the active theme is dark, THE Web_App SHALL render the dark-safe logo variant in place of the default logo variant within 100ms of the theme change being applied.
4. WHEN the OS color scheme is dark, THE Mobile_App SHALL render the dark-safe logo variant in the header and the dark-safe icon asset on the splash screen within one rendered frame of app launch or theme change.
5. THE Web_App SHALL preserve the splash screen background color and white wordmark across both light and dark themes, such that the wordmark contrast ratio against the splash background is ≥ 4.5:1 as measured by the WCAG contrast algorithm.
6. IF the dark-safe logo variant asset file is not found or fails to load, THEN THE Web_App SHALL fall back to the default logo variant and log an error indicating the missing asset, without displaying a broken image or blank space.
7. IF the dark-safe logo or icon asset fails to load on the Mobile_App, THEN THE Mobile_App SHALL fall back to the default asset and display a non-empty placeholder of equal dimensions, without displaying a broken image or blank space.

---

### Requirement 12: Cross-Platform — Data Visualization Legibility

**User Story:** As a school administrator viewing fee reports and timetable grids,
I want all charts and tables to remain fully legible in both themes so that I
can read all labels, values, and legends without strain.

#### Acceptance Criteria

1. THE Recharts bar and line chart axis labels SHALL use the muted-foreground token value so they achieve a contrast ratio of ≥ 4.5:1 against the page background token value in both light and dark themes.
2. WHEN the Recharts tooltip is displayed, THE tooltip container SHALL use the card background token as its background and the card-foreground token as its text color, achieving a contrast ratio of ≥ 4.5:1 between tooltip text and tooltip background in both light and dark themes.
3. THE timetable grid cell borders SHALL use the border token value so they achieve a contrast ratio of ≥ 3:1 against the grid background in both light and dark themes.
4. THE timetable grid text (subject names, teacher names, room labels) SHALL use the card-foreground token value, achieving a contrast ratio of ≥ 4.5:1 against the cell background in both light and dark themes.
5. THE chart legend text SHALL use the foreground token value, achieving a contrast ratio of ≥ 4.5:1 against the chart background in both light and dark themes.
6. THE chart series colors (data colors, not chrome) SHALL each maintain a contrast ratio of ≥ 3:1 against the page background token value in both light and dark themes, per WCAG 2.1 §1.4.11 (Non-text Contrast).
7. IF any rendered chart or timetable element fails its required contrast ratio in either theme, THEN THE Web_App SHALL flag the failing element with an error message indicating which element and theme failed and its measured contrast ratio, and the element SHALL be re-measured after the token value or chart configuration is updated to confirm a passing ratio before the release is approved.
8. WHEN a timetable grid cell contains no scheduled entry, THE Web_App SHALL render the empty cell using the card background token and the border token for its border, maintaining the ≥ 3:1 border-to-background contrast ratio required by criterion 3.

---

### Requirement 13: Cross-Platform — WCAG AA Compliance in Both Themes

**User Story:** As a user with low vision, I want all interactive and informational
elements in both themes to meet WCAG AA contrast so that Bidii is accessible
regardless of which mode is active.

#### Acceptance Criteria

1. THE Web_App SHALL achieve a contrast ratio of ≥ 4.5:1 between `--color-foreground` and `--color-background` in both light and dark themes.
2. THE Web_App SHALL achieve a contrast ratio of ≥ 4.5:1 between `--color-card-foreground` and `--color-card` in both light and dark themes.
3. THE Web_App SHALL achieve a contrast ratio of ≥ 3:1 between `--color-border` and `--color-background` in both light and dark themes.
4. THE Web_App SHALL achieve a contrast ratio of ≥ 3:1 between icon `currentColor` values and their immediate background color in both themes.
5. THE Web_App SHALL achieve a contrast ratio of ≥ 4.5:1 between placeholder text and input background in both themes.
6. THE Mobile_App SHALL achieve a contrast ratio of ≥ 4.5:1 between `colors.foreground` and `colors.background` in both light and dark palettes.
7. THE Mobile_App SHALL achieve a contrast ratio of ≥ 4.5:1 between `colors.cardForeground` and `colors.card` in both light and dark palettes.
8. THE Mobile_App SHALL achieve a contrast ratio of ≥ 4.5:1 between `colors.placeholder` and `colors.input` in both light and dark palettes.
9. THE Mobile_App's disabled button label SHALL use `colors.mutedForeground` over `colors.muted` and the resulting ratio SHALL be ≥ 3:1.
10. WHEN a status badge uses a background color from the semantic status palette (danger, success, warn, info), THE Web_App and Mobile_App SHALL ensure the badge text color provides ≥ 4.5:1 contrast against the badge background in both themes.
11. THE Web_App SHALL achieve a contrast ratio of ≥ 4.5:1 between `--color-primary-foreground` and `--color-primary`, and ≥ 4.5:1 between `--color-destructive-foreground` and `--color-destructive`, in both light and dark themes.
12. THE Web_App SHALL achieve a contrast ratio of ≥ 4.5:1 between focus ring color and the background it appears on in both light and dark themes.
13. WHEN the active theme changes, THE Web_App and Mobile_App SHALL immediately apply the updated contrast-compliant token values without requiring a page reload or app restart, such that all contrast requirements are satisfied within the same render cycle as the theme change.

---

### Requirement 14: Cross-Platform — No Manual Toggle in v1

**User Story:** As a product owner, I want the dark mode system to be entirely
automatic in v1 so that the UX is frictionless and the implementation scope stays
focused.

#### Acceptance Criteria

1. THE Web_App SHALL NOT render a manual light/dark toggle button or switch in the navigation, settings, or profile areas in v1.
2. THE Mobile_App SHALL NOT render a manual theme selector in settings screens or profile screens in v1.
3. THE Theme_Provider on web SHALL expose `toggle` and `setTheme` as part of its internal API without binding either function to any rendered UI element or user-accessible interaction in v1.
4. THE Theme_Context on mobile SHALL expose only `{ scheme, colors }` from `useTheme()` — no setter function — in v1.
5. WHEN a user's OS-level color scheme preference changes, THE Web_App SHALL update its rendered theme to match the new OS preference within 500 milliseconds, without reading or applying any previously stored theme value.
6. WHEN a user's OS-level color scheme preference changes, THE Mobile_App SHALL update its rendered theme to match the new OS preference within 500 milliseconds, without reading or applying any previously stored theme value.

---

### Requirement 15: Cross-Platform — Contrast Audit Procedure

**User Story:** As a QA engineer, I want a documented, repeatable test procedure
for verifying dark mode contrast so that every release can be validated against
WCAG AA before shipping.

#### Acceptance Criteria

1. THE audit procedure SHALL include toggling the OS dark mode setting on and navigating to every major screen: dashboard/home, student list, fee report, timetable, attendance, library, settings, login.
2. THE audit procedure SHALL capture at least one full-page screenshot of each screen in light mode and at least one full-page screenshot of each screen in dark mode, displayed side-by-side in the audit report, within 5 minutes of toggling the OS dark mode setting.
3. THE audit procedure SHALL check each of the following element categories on every screen: body text, heading text, label text, placeholder text in inputs, disabled state of buttons, icon-only buttons, table row separators, modal backgrounds, toast/snackbar notifications, chart axis labels, chart legends, skeleton/loading placeholders, status badges, empty-state illustrations.
4. THE audit procedure SHALL measure the contrast ratio of each element category listed in criterion 3 using a color contrast analyser tool and flag any element where the measured contrast ratio is below 4.5:1 for normal text (below 18pt or below 14pt bold), below 3:1 for large text (18pt or above, or 14pt bold or above), and below 3:1 for non-text UI components and graphical objects.
5. WHEN a contrast failure is flagged, THE audit procedure SHALL record the affected screen name, element category, measured contrast ratio, and the foreground and background color values observed at the time of measurement.
6. WHEN a contrast failure is recorded, THE system SHALL NOT be approved for release until the offending design token or paired dark variant is updated and the element re-measured to confirm a passing contrast ratio.
7. IF the OS dark mode toggle is unavailable on the test device, THEN THE audit procedure SHALL apply dark mode by switching the in-app theme setting and document which activation method was used in the audit report.
