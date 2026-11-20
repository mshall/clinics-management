// GENERATED from tokens.json by scripts/build-tokens.cjs — do not edit.
// Usage: presets: [require("./brand/tailwind-preset.cjs")], plus import tokens.css. Use `dark:` via data-theme="dark" or .dark.
module.exports = {
  darkMode: ["variant", [":root[data-theme='dark'] &", ".dark &"]],
  theme: { extend: {
  "colors": {
    "kx-indigo": {
      "50": "#F1F1F9",
      "100": "#DCDBEF",
      "200": "#C7C5E5",
      "300": "#B1AEDB",
      "400": "#9B97D1",
      "500": "#8480C6",
      "600": "#6C67BC",
      "700": "#544EB0",
      "800": "#3730A3",
      "900": "#221E62",
      "950": "#11102E"
    },
    "kx-ocean": {
      "50": "#EDF5F8",
      "100": "#CFE2ED",
      "200": "#B0D0E2",
      "300": "#91BDD6",
      "400": "#70AACA",
      "500": "#4F96BD",
      "600": "#2C81B0",
      "700": "#0369A1",
      "800": "#064974",
      "900": "#092F4F",
      "950": "#0B172E"
    },
    "kx-coral": {
      "50": "#FDF5F4",
      "100": "#F9DED8",
      "200": "#F6C5BD",
      "300": "#F1ACA0",
      "400": "#ED9281",
      "500": "#E8735E",
      "600": "#B75C50",
      "700": "#8F4944",
      "800": "#6B383A",
      "900": "#48282F",
      "950": "#261826"
    },
    "kx-neutral": {
      "50": "#F4F6FC",
      "100": "#EBEEF8",
      "200": "#DDE1EF",
      "300": "#C5CBDF",
      "400": "#9AA2BF",
      "500": "#6F7899",
      "600": "#535B7B",
      "700": "#3F4663",
      "800": "#2A2F4A",
      "900": "#1A1D36",
      "950": "#0F1024"
    },
    "kx-rose": {
      "50": "#FDEFF2",
      "100": "#F9CFD8",
      "200": "#F4AFBE",
      "300": "#F08EA3",
      "400": "#EB6B87",
      "500": "#E7476A",
      "600": "#E11D48",
      "700": "#A7183D",
      "800": "#791533",
      "900": "#4E112B",
      "950": "#260E23"
    },
    "kx-bg": "var(--kx-bg)",
    "kx-bg-subtle": "var(--kx-bg-subtle)",
    "kx-surface": "var(--kx-surface)",
    "kx-raised": "var(--kx-surface-raised)",
    "kx-sunken": "var(--kx-surface-sunken)",
    "kx-border": "var(--kx-border)",
    "kx-border-strong": "var(--kx-border-strong)",
    "kx-text": "var(--kx-text)",
    "kx-muted": "var(--kx-text-muted)",
    "kx-subtle": "var(--kx-text-subtle)",
    "kx-primary": "var(--kx-primary)",
    "kx-primary-hover": "var(--kx-primary-hover)",
    "kx-primary-soft": "var(--kx-primary-soft)",
    "kx-on-primary": "var(--kx-on-primary)",
    "kx-secondary": "var(--kx-secondary)",
    "kx-secondary-soft": "var(--kx-secondary-soft)",
    "kx-accent": "var(--kx-accent)",
    "kx-accent-soft": "var(--kx-accent-soft)",
    "kx-link": "var(--kx-link)",
    "kx-focus": "var(--kx-focus)",
    "kx-success": "var(--kx-success)",
    "kx-success-soft": "var(--kx-success-soft)",
    "kx-warning": "var(--kx-warning)",
    "kx-warning-soft": "var(--kx-warning-soft)",
    "kx-danger": "var(--kx-danger)",
    "kx-danger-soft": "var(--kx-danger-soft)",
    "kx-info": "var(--kx-info)",
    "kx-info-soft": "var(--kx-info-soft)"
  },
  "fontFamily": {
    "kx": [
      "var(--kx-font)"
    ],
    "kx-ar": [
      "var(--kx-font-ar)"
    ],
    "kx-mono": [
      "var(--kx-font-mono)"
    ]
  },
  "fontSize": {
    "kx-xs": [
      "0.75rem",
      {
        "lineHeight": "1rem",
        "letterSpacing": "0.01em"
      }
    ],
    "kx-sm": [
      "0.875rem",
      {
        "lineHeight": "1.25rem",
        "letterSpacing": "0em"
      }
    ],
    "kx-base": [
      "1rem",
      {
        "lineHeight": "1.5rem",
        "letterSpacing": "0em"
      }
    ],
    "kx-lg": [
      "1.125rem",
      {
        "lineHeight": "1.75rem",
        "letterSpacing": "-0.005em"
      }
    ],
    "kx-xl": [
      "1.25rem",
      {
        "lineHeight": "1.75rem",
        "letterSpacing": "-0.01em"
      }
    ],
    "kx-2xl": [
      "1.5rem",
      {
        "lineHeight": "2rem",
        "letterSpacing": "-0.015em"
      }
    ],
    "kx-3xl": [
      "1.875rem",
      {
        "lineHeight": "2.375rem",
        "letterSpacing": "-0.02em"
      }
    ],
    "kx-4xl": [
      "2.25rem",
      {
        "lineHeight": "2.75rem",
        "letterSpacing": "-0.025em"
      }
    ],
    "kx-5xl": [
      "3rem",
      {
        "lineHeight": "3.25rem",
        "letterSpacing": "-0.03em"
      }
    ],
    "kx-6xl": [
      "3.75rem",
      {
        "lineHeight": "4rem",
        "letterSpacing": "-0.035em"
      }
    ]
  },
  "borderRadius": {
    "kx-xs": "4px",
    "kx-sm": "8px",
    "kx-md": "12px",
    "kx-lg": "16px",
    "kx-xl": "24px",
    "kx-2xl": "32px",
    "kx-full": "9999px"
  },
  "boxShadow": {
    "kx-1": "var(--kx-shadow-1)",
    "kx-2": "var(--kx-shadow-2)",
    "kx-3": "var(--kx-shadow-3)",
    "kx-4": "var(--kx-shadow-4)"
  },
  "transitionDuration": {
    "kx-instant": "var(--kx-dur-instant)",
    "kx-fast": "var(--kx-dur-fast)",
    "kx-base": "var(--kx-dur-base)",
    "kx-slow": "var(--kx-dur-slow)",
    "kx-slower": "var(--kx-dur-slower)",
    "kx-pulse": "var(--kx-dur-pulse)"
  },
  "transitionTimingFunction": {
    "kx-standard": "var(--kx-ease-standard)",
    "kx-decelerate": "var(--kx-ease-decelerate)",
    "kx-accelerate": "var(--kx-ease-accelerate)",
    "kx-spring": "var(--kx-ease-spring)"
  },
  "backdropBlur": {
    "kx-sm": "var(--kx-blur-sm)",
    "kx-md": "var(--kx-blur-md)",
    "kx-lg": "var(--kx-blur-lg)"
  },
  "minHeight": {
    "kx-touch": "var(--kx-touch-min)",
    "kx-nurse": "var(--kx-touch-nurse)"
  },
  "minWidth": {
    "kx-touch": "var(--kx-touch-min)",
    "kx-nurse": "var(--kx-touch-nurse)"
  }
} },
};
