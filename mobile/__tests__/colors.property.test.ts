/**
 * Property-based tests for the dark-mode color token system.
 * Uses fast-check with numRuns: 100 for each property.
 *
 * Tasks: 8.3 (Property 2), 8.4 (Property 3), 8.5 (Property 1), 8.8 (Property 4)
 */
import fc from 'fast-check';
import { getColors, ColorTokens } from '../constants/colors';

// ── WCAG relative luminance helpers ──────────────────────────────────────────
function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}
function contrastRatio(c1: string, c2: string): number {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const lighter = Math.max(l1, l2);
  const darker  = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const REQUIRED_KEYS: Array<keyof ColorTokens> = [
  'background', 'foreground', 'card', 'cardForeground', 'border', 'input',
  'muted', 'mutedForeground', 'primary', 'primaryForeground',
  'destructive', 'destructiveForeground',
  'success', 'successForeground', 'warn', 'warnForeground', 'placeholder',
];
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

// ── Property 2: Token schema completeness ────────────────────────────────────
// Task 8.3
// Validates: Requirements 8.1, 8.2, 8.3, 8.5, 8.7
it('Property 2: all 17 token keys present with valid hex values in both schemes', () => {
  fc.assert(
    fc.property(fc.constantFrom('light' as const, 'dark' as const), (scheme) => {
      const palette = getColors(scheme);
      for (const key of REQUIRED_KEYS) {
        expect(palette).toHaveProperty(key);
        expect(palette[key]).toMatch(HEX_PATTERN);
      }
    }),
    { numRuns: 100 },
  );
});

// ── Property 3: getColors scheme routing ─────────────────────────────────────
// Task 8.4
// Validates: Requirements 8.4, 7.2, 7.3
it('Property 3: getColors routes to correct palette anchors and is referentially stable', () => {
  fc.assert(
    fc.property(fc.constantFrom('light' as const, 'dark' as const), (scheme) => {
      const palette = getColors(scheme);
      if (scheme === 'light') {
        expect(palette.background).toBe('#FAFBFC');
        expect(palette.card).toBe('#FFFFFF');
        expect(palette.border).toBe('#E8EDF2');
      } else {
        expect(palette.background).toBe('#0D1B2A');
        expect(palette.card).toBe('#162233');
        expect(palette.border).toBe('#1E3347');
      }
      // Referential stability: same object returned on repeated calls
      expect(getColors(scheme)).toBe(palette);
    }),
    { numRuns: 100 },
  );
});

// ── Property 1: WCAG AA contrast compliance ───────────────────────────────────
// Task 8.5
// Validates: Requirements 2.4, 2.5, 13.1, 13.2, 13.6, 13.7, 13.11
const PAIRS_4_5: Array<[keyof ColorTokens, keyof ColorTokens]> = [
  ['foreground', 'background'],
  ['cardForeground', 'card'],
  ['primaryForeground', 'primary'],
  ['destructiveForeground', 'destructive'],
  ['successForeground', 'success'],
  ['warnForeground', 'warn'],
  ['placeholder', 'input'],
];
const PAIRS_3: Array<[keyof ColorTokens, keyof ColorTokens]> = [
  ['mutedForeground', 'muted'],
];

it('Property 1: all required token pairs meet WCAG AA contrast in both schemes', () => {
  fc.assert(
    fc.property(fc.constant(null), () => {
      for (const scheme of ['light', 'dark'] as const) {
        const p = getColors(scheme);
        for (const [fg, bg] of PAIRS_4_5) {
          const ratio = contrastRatio(p[fg], p[bg]);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        }
        for (const [fg, bg] of PAIRS_3) {
          const ratio = contrastRatio(p[fg], p[bg]);
          expect(ratio).toBeGreaterThanOrEqual(3.0);
        }
      }
    }),
    { numRuns: 100 },
  );
});

// ── Property 4: useTheme reference stability ──────────────────────────────────
// Task 8.8
// Validates: Requirement 7.7
// This is a compile-time + unit structural test — useMemo keyed on [scheme]
// guarantees stable references. We verify the getColors function itself is stable.
it('Property 4: getColors returns the same reference for repeated calls with the same scheme', () => {
  fc.assert(
    fc.property(fc.constantFrom('light' as const, 'dark' as const), (scheme) => {
      const first  = getColors(scheme);
      const second = getColors(scheme);
      expect(Object.is(first, second)).toBe(true);
    }),
    { numRuns: 100 },
  );
});
