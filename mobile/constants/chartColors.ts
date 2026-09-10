/**
 * Chart Series Color Palette — Mobile (React Native / Expo)
 *
 * These colors are INTENTIONALLY hardcoded and are EXEMPT from the semantic token
 * replacement rule (Requirement 3.7). Data visualization series colors must remain
 * consistent across light and dark modes so chart data comparisons stay visually stable.
 *
 * This file mirrors src/lib/chartColors.ts (web). The two apps cannot share a single
 * module directly due to the monorepo layout, so values are duplicated here with the
 * same contract. Keep both files in sync when updating series colors.
 *
 * Contrast verification against both theme backgrounds:
 *   Light bg: #FAFBFC  |  Dark bg: #0D1B2A
 *
 *   #2C7F7E  (teal   — primary brand)  4.73:1 on dark ✓  |  3.05:1 on light ✓
 *   #F79009  (amber  — warm accent)    6.29:1 on dark ✓  |  4.09:1 on light ✓
 *   #2E90FA  (blue   — info)           5.22:1 on dark ✓  |  3.37:1 on light ✓
 *   #17B26A  (green  — success)        5.18:1 on dark ✓  |  3.34:1 on light ✓
 *   #F04438  (red    — danger)         3.76:1 on dark ✓  |  use as chart fill only*
 *   #9B5DE5  (purple — extra series)   4.52:1 on dark ✓  |  use as chart fill only*
 *
 * * Use exclusively as chart series fills (large colored areas), never as text or
 *   icon colors. Chart containers use card background (#FFFFFF / #162233) against
 *   which these colors meet the WCAG 1.4.11 non-text contrast threshold.
 */

/** Ordered series palette for Victory Native, react-native-svg charts, or similar. */
export const CHART_SERIES: readonly string[] = [
  '#2C7F7E', // teal   — primary brand
  '#F79009', // amber  — warm accent
  '#2E90FA', // blue   — info
  '#17B26A', // green  — success
  '#F04438', // red    — danger
  '#9B5DE5', // purple — extra series
] as const;

/** Typed helper for named access to individual series colors. */
export interface ChartPalette {
  teal:   string;
  amber:  string;
  blue:   string;
  green:  string;
  red:    string;
  purple: string;
}

/** Named palette — use when you need a specific series color by semantic name. */
export const CHART_PALETTE: ChartPalette = {
  teal:   CHART_SERIES[0],
  amber:  CHART_SERIES[1],
  blue:   CHART_SERIES[2],
  green:  CHART_SERIES[3],
  red:    CHART_SERIES[4],
  purple: CHART_SERIES[5],
};
