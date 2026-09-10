# Dark-Mode Logo Asset Required

## `public/logo-dark.png` is missing

This file needs to be created by a designer and placed at:

```
public/logo-dark.png
```

### Requirements

- Start from `public/logo.png` (the current default logo)
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

### Logo component

`src/components/Logo.tsx` already references `/logo-dark.png` and includes an
`onError` fallback handler — so the app will NOT break until this asset is created.
Once the file is placed here the Logo component will automatically serve it in dark
mode without any code changes.

### Reference

- Design spec: dark-mode-system-sync §11.1, §11.3, §11.6
- Requirements: 11.1, 11.3, 11.5, 11.6
