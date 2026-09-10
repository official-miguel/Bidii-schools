/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: This file extends the parent web app's tailwind.config.ts to inherit
  // the exact same design tokens, ensuring visual consistency across platforms.
  darkMode: 'media',
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // ── Primary brand (inherited from web) ─────────────────────────
        teal: {
          DEFAULT: "#2C7F7E",
          light:   "#3A9998",
          dark:    "#1F5C5B",
          50:      "#EDF7F7",
          100:     "#D0EDED",
          900:     "#0D3333",
        },

        // ── Semantic aliases ────────────────────────────────────────────
        ink: {
          DEFAULT: "#1F2933",
          light:   "#2D3D4D",
        },
        paper: "#FAFBFC",
        card: "#FFFFFF",
        line: "#E8EDF2",
        
        slate: {
          DEFAULT: "#667085",
          light:   "#98A2B3",
        },

        // ── Semantic status ─────────────────────────────────────────────
        danger: {
          DEFAULT: "#F04438",
          bg:      "#FEF3F2",
        },
        "danger-bg": "#FEF3F2",

        success: {
          DEFAULT: "#17B26A",
          bg:      "#ECFDF3",
        },
        "success-bg": "#ECFDF3",

        warn: {
          DEFAULT: "#F79009",
          bg:      "#FFFAEB",
        },
        "warn-bg": "#FFFAEB",

        info: {
          DEFAULT: "#2E90FA",
          bg:      "#EFF8FF",
        },

        // ── Dark mode surfaces ──────────────────────────────────────────
        "dark-bg":      "#0D1B2A",
        "dark-surface": "#162233",
        "dark-border":  "#1E3347",
        "dark-text":    "#E8EDF2",
        "dark-muted":   "#667085",

        // ── Semantic tokens (dark-mode-system-sync, Req 9.1) ───────────
        background:             "#FAFBFC",
        foreground:             "#1F2933",
        // card already exists above as "#FFFFFF" — redeclare so semantic key is present
        border:                 "#E8EDF2",
        input:                  "#FAFBFC",
        muted:                  "#F4F6F8",
        "muted-foreground":     "#667085",
        primary:                "#2C7F7E",
        "primary-foreground":   "#FFFFFF",
        destructive:            "#C62828",
        "destructive-foreground": "#FFFFFF",
        // success & warn: override the object variants defined above with flat strings
        success:                "#ECFDF3",
        "success-foreground":   "#0D4D2D",
        warn:                   "#FFFAEB",
        "warn-foreground":      "#7A3D00",
        "card-foreground":      "#1F2933",
      },

      fontFamily: {
        // Inter is the sole typeface — matches web exactly
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Inter", "system-ui", "sans-serif"],
      },

      fontSize: {
        // 8-point type scale (inherited from web)
        xs:   ["0.75rem",  { lineHeight: "1rem" }],
        sm:   ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem",     { lineHeight: "1.5rem" }],
        lg:   ["1.125rem", { lineHeight: "1.75rem" }],
        xl:   ["1.25rem",  { lineHeight: "1.75rem" }],
        "2xl":["1.5rem",   { lineHeight: "2rem" }],
        "3xl":["1.875rem", { lineHeight: "2.25rem" }],
        "4xl":["2.25rem",  { lineHeight: "2.5rem" }],
      },

      spacing: {
        // 8-point base grid (4px = 1rem = 16px)
        "0.5": "0.125rem",   //  2px
        "1":   "0.25rem",    //  4px
        "1.5": "0.375rem",   //  6px
        "2":   "0.5rem",     //  8px
        "2.5": "0.625rem",   // 10px
        "3":   "0.75rem",    // 12px
        "3.5": "0.875rem",   // 14px
        "4":   "1rem",       // 16px
        "4.5": "1.125rem",   // 18px
        "5":   "1.25rem",    // 20px
        "6":   "1.5rem",     // 24px
        "7":   "1.75rem",    // 28px
        "8":   "2rem",       // 32px
        "9":   "2.25rem",    // 36px
        "10":  "2.5rem",     // 40px
        "11":  "2.75rem",    // 44px — minimum tap target
        "12":  "3rem",       // 48px
        "14":  "3.5rem",     // 56px
        "16":  "4rem",       // 64px
        "20":  "5rem",       // 80px
        "24":  "6rem",       // 96px
      },

      borderRadius: {
        none: "0",
        sm:   "6px",
        DEFAULT: "8px",
        md:   "10px",   // buttons & inputs
        lg:   "12px",   // cards
        xl:   "16px",   // dialogs
        "2xl":"20px",
        full: "9999px",
      },

      // React Native doesn't support multi-layer box shadows well,
      // so we use elevation instead (handled in components)
      elevation: {
        xs:  2,
        sm:  4,
        DEFAULT: 6,
        md:  8,
        lg:  12,
        xl:  16,
      },
    },
  },
  plugins: [],
};
