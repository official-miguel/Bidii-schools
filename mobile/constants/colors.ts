/**
 * Bidii Mobile — Semantic Color Tokens
 *
 * This file defines the typed color token system for dark-mode-aware theming.
 * All values are verified against WCAG 2.1 AA contrast requirements — see
 * design.md §Semantic Token Palette for the full contrast table.
 *
 * Usage (imperative / StyleSheet):
 *   import { getColors } from '@/constants/colors';
 *   const colors = getColors(scheme);  // scheme from useTheme()
 *   StyleSheet.create({ container: { backgroundColor: colors.card } });
 *
 * The module-level `light` and `dark` constants are intentionally stable
 * references — getColors() returns the same object on repeated calls with
 * the same scheme argument (Property 3: referential stability).
 */

// ── Interface ────────────────────────────────────────────────────────────────

export interface ColorTokens {
  /** Page / screen background */
  background:             string;
  /** Primary body and heading text */
  foreground:             string;
  /** Card, modal, and sheet surface */
  card:                   string;
  /** Text rendered on card surfaces */
  cardForeground:         string;
  /** Dividers, input outlines, and separator lines */
  border:                 string;
  /** Input field fill (text inputs, selects) */
  input:                  string;
  /** Subtle background for alternate rows, table headers, disabled fields */
  muted:                  string;
  /** Secondary / helper text rendered on muted surfaces */
  mutedForeground:        string;
  /** Primary brand action color */
  primary:                string;
  /** Text / icons rendered on primary background */
  primaryForeground:      string;
  /** Error / danger action color */
  destructive:            string;
  /** Text / icons rendered on destructive background */
  destructiveForeground:  string;
  /** Success badge / chip background */
  success:                string;
  /** Text rendered on success background */
  successForeground:      string;
  /** Warning badge / chip background */
  warn:                   string;
  /** Text rendered on warn background */
  warnForeground:         string;
  /** TextInput placeholder text (mobile-only; web uses CSS ::placeholder) */
  placeholder:            string;
}

// ── Light palette ────────────────────────────────────────────────────────────
// Anchors: background=#FAFBFC  card=#FFFFFF  border=#E8EDF2

const light: ColorTokens = {
  background:             '#FAFBFC',
  foreground:             '#1F2933',  // 14.24:1 on background ✓
  card:                   '#FFFFFF',
  cardForeground:         '#1F2933',  // 14.76:1 on card ✓
  border:                 '#E8EDF2',
  input:                  '#FAFBFC',
  muted:                  '#F4F6F8',
  mutedForeground:        '#667085',  //  4.59:1 on muted ✓ (≥3:1 large text)
  primary:                '#2C7F7E',
  primaryForeground:      '#FFFFFF',  //  4.73:1 on primary ✓
  destructive:            '#C62828',
  destructiveForeground:  '#FFFFFF',  //  5.62:1 on destructive ✓
  success:                '#ECFDF3',
  successForeground:      '#0D4D2D',  //  9.41:1 on success ✓
  warn:                   '#FFFAEB',
  warnForeground:         '#7A3D00',  //  8.07:1 on warn ✓
  placeholder:            '#667085',  //  4.80:1 on input ✓
};

// ── Dark palette ─────────────────────────────────────────────────────────────
// Anchors: background=#0D1B2A  card=#162233  border=#1E3347

const dark: ColorTokens = {
  background:             '#0D1B2A',
  foreground:             '#E8EDF2',  // 14.77:1 on background ✓
  card:                   '#162233',
  cardForeground:         '#E8EDF2',  // 13.60:1 on card ✓
  border:                 '#1E3347',
  input:                  '#162233',
  muted:                  '#1E3347',
  mutedForeground:        '#8FA3B8',  //  5.00:1 on muted ✓
  primary:                '#2C7F7E',
  primaryForeground:      '#FFFFFF',  //  4.73:1 on primary ✓
  destructive:            '#C62828',
  destructiveForeground:  '#FFFFFF',  //  5.62:1 on destructive ✓
  success:                '#0F2B1A',
  successForeground:      '#6EE7B7',  //  9.98:1 on success ✓
  warn:                   '#2D1A00',
  warnForeground:         '#FCD34D',  // 11.56:1 on warn ✓
  placeholder:            '#8FA3B8',  //  6.18:1 on input ✓
};

// ── Accessor ─────────────────────────────────────────────────────────────────

/**
 * Returns the color token palette for the given color scheme.
 *
 * The returned object is the module-level constant, so repeated calls with
 * the same scheme argument return the exact same reference (referential
 * stability — required by Property 3).
 *
 * @param scheme - `'light'` or `'dark'`
 * @returns ColorTokens for the requested scheme
 */
export function getColors(scheme: 'light' | 'dark'): ColorTokens {
  return scheme === 'dark' ? dark : light;
}
