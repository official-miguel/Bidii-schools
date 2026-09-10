# Dark Mode — Developer Reference

## Overview

Bidii implements automatic, OS-synced dark mode across both the web dashboard (Next.js
14 + Tailwind CSS) and the mobile app (React Native / Expo + NativeWind v4).

The theme follows the device or OS appearance setting exclusively. **No manual
toggle is exposed in v1.** When the OS switches between light and dark, both apps
update within one render cycle — no page reload or app restart required.

The system is built on a shared semantic token palette: 16 named color roles whose
hex values differ between light and dark. Components reference tokens, never raw
hex literals. This means adding dark mode support to a component is usually just
swapping a hardcoded class (`bg-white`) for its semantic equivalent (`bg-card`).

---

## Web — Semantic Token Reference

### How the tokens work

CSS custom properties are declared on `:root` (light) and `html.dark` (dark) in
`src/app/globals.css`. Tailwind maps each token to a utility class via
`theme.extend.colors` in `tailwind.config.js`. When the OS switches scheme, the
`ThemeProvider` adds or removes the `dark` class on `<html>`, and all CSS variables
resolve to their dark-mode values in the same paint cycle.

### Token table

| Token name             | CSS variable                    | Tailwind utility                        | Light hex | Dark hex  |
|------------------------|---------------------------------|-----------------------------------------|-----------|-----------|
| `background`           | `--color-background`            | `bg-background` / `text-background`     | `#FAFBFC` | `#0D1B2A` |
| `foreground`           | `--color-foreground`            | `bg-foreground` / `text-foreground`     | `#1F2933` | `#E8EDF2` |
| `card`                 | `--color-card`                  | `bg-card` / `text-card`                 | `#FFFFFF` | `#162233` |
| `card-foreground`      | `--color-card-foreground`       | `bg-card-foreground` / `text-card-foreground` | `#1F2933` | `#E8EDF2` |
| `border`               | `--color-border`                | `border-border`                         | `#E8EDF2` | `#1E3347` |
| `input`                | `--color-input`                 | `bg-input`                              | `#FAFBFC` | `#162233` |
| `muted`                | `--color-muted`                 | `bg-muted`                              | `#F4F6F8` | `#1E3347` |
| `muted-foreground`     | `--color-muted-foreground`      | `text-muted-foreground`                 | `#667085` | `#8FA3B8` |
| `primary`              | `--color-primary`               | `bg-primary`                            | `#2C7F7E` | `#2C7F7E` |
| `primary-foreground`   | `--color-primary-foreground`    | `text-primary-foreground`               | `#FFFFFF` | `#FFFFFF` |
| `destructive`          | `--color-destructive`           | `bg-destructive`                        | `#C62828` | `#C62828` |
| `destructive-foreground` | `--color-destructive-foreground` | `text-destructive-foreground`        | `#FFFFFF` | `#FFFFFF` |
| `success`              | `--color-success`               | `bg-success`                            | `#ECFDF3` | `#0F2B1A` |
| `success-foreground`   | `--color-success-foreground`    | `text-success-foreground`               | `#0D4D2D` | `#6EE7B7` |
| `warn`                 | `--color-warn`                  | `bg-warn`                               | `#FFFAEB` | `#2D1A00` |
| `warn-foreground`      | `--color-warn-foreground`       | `text-warn-foreground`                  | `#7A3D00` | `#FCD34D` |

All foreground/background pairs satisfy WCAG 2.1 AA (≥ 4.5:1 for normal text, ≥ 3:1
for large text and muted pairs) in both themes.

---

## Web — Usage Examples

### Using Tailwind utilities

Reference semantic token utilities directly in `className`. The correct value resolves
automatically in both light and dark mode — no `dark:` variant needed.

```tsx
// Card surface with primary body text
<div className="bg-card text-card-foreground rounded-lg p-4 border border-border">
  <h2 className="text-foreground font-semibold">Student Record</h2>
  <p className="text-muted-foreground text-sm">Grade 8 · Section A</p>
</div>

// Status badges
<span className="bg-success text-success-foreground px-2 py-0.5 rounded-full text-xs">
  Active
</span>
<span className="bg-destructive text-destructive-foreground px-2 py-0.5 rounded-full text-xs">
  Overdue
</span>
<span className="bg-warn text-warn-foreground px-2 py-0.5 rounded-full text-xs">
  Pending
</span>

// Primary action button
<button className="bg-primary text-primary-foreground px-4 py-2 rounded-md">
  Save Changes
</button>

// Muted alternate table row
<tr className="bg-muted">
  <td className="text-muted-foreground">—</td>
</tr>
```

### What NOT to do

Never use hardcoded or mode-specific Tailwind classes. These are invisible or
low-contrast in dark mode.

```tsx
// ✗ Wrong — bg-white is invisible against the dark background
<div className="bg-white text-gray-900">...</div>

// ✗ Wrong — hardcoded hex in inline style has no dark-mode counterpart
<div style={{ backgroundColor: '#ffffff', color: '#1F2933' }}>...</div>

// ✗ Wrong — text-black disappears on dark surfaces
<p className="text-black">Student name</p>
```

Use the semantic equivalents instead:

```tsx
// ✓ Correct
<div className="bg-card text-card-foreground">...</div>
<p className="text-foreground">Student name</p>
```

### SVG icon pattern

SVG icons must inherit the surrounding text color via `currentColor`. Never hardcode
a `fill` or `stroke` hex value on an icon path.

```tsx
// ✓ Correct — icon inherits the parent text color token
<span className="text-foreground">
  <svg viewBox="0 0 24 24" className="w-5 h-5">
    <path fill="currentColor" d="M..." />
  </svg>
</span>

// ✓ Correct — danger icon in a specific semantic color
<span className="text-destructive">
  <AlertCircleIcon className="w-4 h-4" /> {/* Lucide icons use currentColor by default */}
</span>

// ✗ Wrong — hardcoded fill is invisible on dark backgrounds
<path fill="#1F2933" d="M..." />
```

Lucide React icons (`lucide-react`, `lucide-react-native`) already use `currentColor`
internally — just control the color via the parent's `text-*` class or the icon's
own `className` prop.

---

## Mobile — useTheme() Hook

### Import

```tsx
import { useTheme } from '@/lib/ThemeContext';
```

### API

```tsx
const { scheme, colors } = useTheme();
// scheme: 'light' | 'dark'
// colors: ColorTokens  — the resolved palette for the active OS scheme
```

The hook throws an error if called outside a `ThemeProvider`. The provider is mounted
at the root of the navigation tree in `mobile/app/_layout.tsx`, so every screen and
modal has access automatically.

### ColorTokens keys

The `colors` object has 17 keys (camelCase, matching the web tokens with the addition
of `placeholder`):

| Key                    | Light hex | Dark hex  | Notes                                    |
|------------------------|-----------|-----------|------------------------------------------|
| `background`           | `#FAFBFC` | `#0D1B2A` | Screen / page background                 |
| `foreground`           | `#1F2933` | `#E8EDF2` | Primary body and heading text            |
| `card`                 | `#FFFFFF` | `#162233` | Card, modal, and sheet surfaces          |
| `cardForeground`       | `#1F2933` | `#E8EDF2` | Text on card surfaces                    |
| `border`               | `#E8EDF2` | `#1E3347` | Dividers, input outlines, separators     |
| `input`                | `#FAFBFC` | `#162233` | Text input fill                          |
| `muted`                | `#F4F6F8` | `#1E3347` | Alternate rows, table headers, disabled  |
| `mutedForeground`      | `#667085` | `#8FA3B8` | Secondary / helper text                  |
| `primary`              | `#2C7F7E` | `#2C7F7E` | Brand action color                       |
| `primaryForeground`    | `#FFFFFF` | `#FFFFFF` | Text on primary background               |
| `destructive`          | `#C62828` | `#C62828` | Error / danger action color              |
| `destructiveForeground`| `#FFFFFF` | `#FFFFFF` | Text on destructive background           |
| `success`              | `#ECFDF3` | `#0F2B1A` | Success badge background                 |
| `successForeground`    | `#0D4D2D` | `#6EE7B7` | Text on success background               |
| `warn`                 | `#FFFAEB` | `#2D1A00` | Warning badge background                 |
| `warnForeground`       | `#7A3D00` | `#FCD34D` | Text on warn background                  |
| `placeholder`          | `#667085` | `#8FA3B8` | `TextInput` placeholder (mobile only)    |

### StyleSheet.create() pattern

Use `useTheme().colors` inside the component body, then reference tokens in
`StyleSheet.create()`. Recreating styles when the scheme changes is handled
automatically because `colors` is a stable module-level reference per scheme.

```tsx
import { StyleSheet, View, Text } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';

export function StudentCard({ name, grade }: { name: string; grade: string }) {
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
      padding: 16,
    },
    name: {
      color: colors.cardForeground,
      fontSize: 16,
      fontWeight: '600',
    },
    grade: {
      color: colors.mutedForeground,
      fontSize: 13,
      marginTop: 2,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.name}>{name}</Text>
      <Text style={styles.grade}>{grade}</Text>
    </View>
  );
}
```

### NativeWind className pattern with dark: variants

NativeWind is configured with `darkMode: 'media'`, so `dark:` variants activate
automatically when the OS reports dark mode — no class toggling needed.

Every light-mode utility used in a `className` prop must be paired with a `dark:`
counterpart. A missing `dark:` pair is treated as a build verification failure.

```tsx
// ✓ Correct — both themes covered with semantic tokens
<View className="bg-card dark:bg-[#162233] rounded-lg p-4">
  <Text className="text-card-foreground dark:text-[#E8EDF2] font-semibold">
    Student Record
  </Text>
  <Text className="text-muted-foreground dark:text-[#8FA3B8] text-sm">
    Grade 8 · Section A
  </Text>
</View>

// ✓ Also correct — when NativeWind reads CSS variables from global.css,
//   semantic token utilities resolve automatically without explicit dark: pairs
<View className="bg-card rounded-lg p-4">
  <Text className="text-foreground">Student Record</Text>
</View>

// ✗ Wrong — no dark: variant; text will be invisible in dark mode
<View className="bg-white rounded-lg p-4">
  <Text className="text-gray-900">Student Record</Text>
</View>
```

For `StyleSheet.create` or inline `style` props that contain dynamic colors, always
use `useTheme().colors` rather than a hardcoded hex literal.

---

## Exemptions — Colors Intentionally Hardcoded

The following colors are intentionally not replaced by semantic tokens, in accordance
with Requirement 3.7. Each has a code comment at its declaration site.

### Chart series colors

Data visualization series colors must remain consistent across themes so chart data
comparisons stay visually stable. They are defined in two files:

- **Web:** `src/lib/chartColors.ts` — `CHART_SERIES` array and `CHART_PALETTE` named map
- **Mobile:** `mobile/constants/chartColors.ts`

```ts
// chart series — intentional hardcoded colors, exempt from token replacement (Req 3.7)
export const CHART_SERIES = [
  '#2C7F7E', // teal   — primary brand
  '#F79009', // amber  — warm accent
  '#2E90FA', // blue   — info
  '#17B26A', // green  — success
  '#F04438', // red    — danger
  '#9B5DE5', // purple — extra series
];
```

Use these colors exclusively as chart series fills (bar, line, pie). Do not apply
them to text or icon elements — contrast against the page background is not
guaranteed for all series colors (see comments in `chartColors.ts`).

### Brand logo fill

The Bidii teal wordmark (`fill="#2C7F7E"`) on a transparent PNG is retained as-is.
The color achieves ≥ 3:1 contrast against the dark card surface (`#162233`). A
dark-safe logo asset (`logo-dark.png`) is served in dark mode via the `Logo` component.

### Splash screen background

`"backgroundColor": "#2C7F7E"` in `mobile/app.json` is the branded splash screen
teal. The white wordmark on this background achieves > 4.5:1 contrast (Requirement
11.5) and does not change between themes.

---

## Future v2 — Manual Toggle

A manual toggle API is scaffolded internally but not exposed in any UI in v1.

**Web:** `ThemeProvider` keeps `toggle` and `setTheme` on its context value. They
are intentionally not wired to any button or control. In v2, binding a toggle button
to `setTheme` is all that is needed.

**Mobile:** `useTheme()` exposes only `{ scheme, colors }` — no setter — in v1. To
add a manual override in v2, extend `ThemeContext` with a `setScheme` function and
store the preference in `AsyncStorage`.

---

## Contrast Audit Procedure

The full audit procedure is specified in **Requirement 15** of the dark mode spec
(`.kiro/specs/dark-mode-system-sync/requirements.md`).

In brief, before each release:

1. Toggle OS dark mode and navigate to all 8 major screens: dashboard, student list,
   fee report, timetable, attendance, library, settings, login.
2. Capture full-page screenshots for both light and dark on each screen.
3. Check every element category: body text, headings, labels, placeholder text,
   disabled buttons, icon-only buttons, table row separators, modal backgrounds,
   toast/snackbar notifications, chart axis labels, chart legends, skeleton
   placeholders, status badges, and empty-state illustrations.
4. Measure any visually marginal element with a contrast analyser tool. Required
   minimums: ≥ 4.5:1 for normal text, ≥ 3:1 for large text and non-text UI
   components (WCAG 2.1 AA).
5. Record failures (screen name, element, measured ratio, fg/bg hex values).
   **Do not approve the release until every failure is resolved and re-measured.**

For automated coverage, `tests/a11y/contrast.spec.ts` runs axe-core via Playwright
against all 8 screens × 2 color schemes as a CI gate.
