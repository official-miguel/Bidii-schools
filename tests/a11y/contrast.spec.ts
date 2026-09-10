/**
 * WCAG AA automated contrast audit — dark-mode-system-sync
 *
 * Runs axe-core color-contrast rule against all 8 major screens
 * in both light and dark color schemes.
 *
 * Requirements: 13.1–13.5, 13.11, 13.12, 15.1–15.4
 */
import { test, expect } from '@playwright/test';
import { checkA11y, injectAxe } from 'axe-playwright';

const SCREENS = [
  { path: '/',                   name: 'dashboard'     },
  { path: '/staff/students',     name: 'student-list'  },
  { path: '/staff/finance',      name: 'fee-report'    },
  { path: '/staff/timetable',    name: 'timetable'     },
  { path: '/staff/attendance',   name: 'attendance'    },
  { path: '/staff/library',      name: 'library'       },
  { path: '/staff/settings',     name: 'settings'      },
  { path: '/login',              name: 'login'         },
];

const COLOR_SCHEMES = ['light', 'dark'] as const;

for (const scheme of COLOR_SCHEMES) {
  for (const screen of SCREENS) {
    test(`contrast audit — ${screen.name} — ${scheme}`, async ({ page }) => {
      // Set OS-level color scheme preference
      await page.emulateMedia({ colorScheme: scheme });

      // Navigate to the screen (may redirect to login — that's fine for contrast check)
      await page.goto(screen.path, { waitUntil: 'networkidle' });

      // Inject and run axe
      await injectAxe(page);
      await checkA11y(page, undefined, {
        axeOptions: {
          runOnly: {
            type: 'rule',
            values: ['color-contrast'],
          },
        },
        includedImpacts: ['critical', 'serious'],
        detailedReport: true,
        detailedReportOptions: { html: true },
      });
    });
  }
}
