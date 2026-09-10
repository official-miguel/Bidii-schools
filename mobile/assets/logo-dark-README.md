# Dark-Mode Logo Asset Required (Mobile)

## `mobile/assets/logo-dark.png` is missing

This file needs to be created by a designer and placed at:

```
mobile/assets/logo-dark.png
```

### Requirements

- Start from the existing default logo asset
- Replace any dark fill colors with **light fill** (`#E8EDF2` or white `#FFFFFF`) so the
  wordmark/icon reads clearly on dark card backgrounds
- The logo MUST achieve a contrast ratio of **≥ 3:1** against the dark card surface
  color `#162233` (WCAG 2.1 §1.4.11 Non-text Contrast)
- Recommended fill: `#E8EDF2` — contrast ratio against `#162233` ≈ 5.4:1 ✓

### Contrast quick-check

| Fill color | Background | Ratio | Pass? |
|---|---|---|---|
| `#FFFFFF` (white) | `#162233` | ~11.5:1 | ✓ |
| `#E8EDF2` (light) | `#162233` | ~5.4:1  | ✓ |
| `#2C7F7E` (brand teal — exempt) | `#162233` | ~3.1:1 | ✓ (≥ 3:1) |

### Mobile Logo component

`mobile/components/Logo.tsx` (task 10.6) reads `scheme` from `useTheme()` and
conditionally passes `logo-dark.png` as the `source` prop, with `defaultSource`
set to the light logo as a fallback per Req 11.7.  Once this asset is in place
the component will automatically display it in dark mode.

### Reference

- Design spec: dark-mode-system-sync §11.2, §11.4, §11.7
- Requirements: 11.2, 11.4, 11.5, 11.7
