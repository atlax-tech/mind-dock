// Design tokens from design_lock.md
export const tokens = {
  color: {
    bg: { canvas: '#fcfcf9', sidebar: '#f4f4ee', workspace: '#fcfcf9', panel: '#f4f4ee', card: '#ffffff' },
    border: { default: '#e6e6dc', subtle: '#e6e6dc' },
    text: { primary: '#2c2c2a', secondary: '#5a5a56', muted: '#7e7e78' },
    accent: { primary: '#059669', soft: '#d1fae5' }, // emerald-600 / emerald-100
    warning: { soft: '#fef3c7' },
    danger: { soft: '#fee2e2' },
  },
  radius: { sm: '4px', md: '6px', lg: '8px', card: '8px' },
  shadow: { none: 'none', soft: '0 1px 2px rgba(0,0,0,0.05)', panel: '0 1px 3px rgba(0,0,0,0.1)' },
  layout: { sidebarWidth: '224px', mentorDockWidth: '256px', headerHeight: '48px' },
  font: { sans: 'ui-sans-serif, system-ui, sans-serif', mono: 'ui-monospace, monospace', document: 'ui-serif, Georgia, serif' },
} as const;

// Dark mode overrides
export const darkTokens = {
  color: {
    bg: { canvas: '#171717', sidebar: '#1f1f1f', workspace: '#171717', panel: '#1f1f1f', card: '#212121' },
    border: { default: '#2f2f2f', subtle: '#2f2f2f' },
    text: { primary: '#e3e3e3', secondary: '#a0a0a0', muted: '#8e8e8e' },
    accent: { primary: '#34d399', soft: '#064e3b' }, // emerald-400 / emerald-950
    warning: { soft: '#78350f' },
    danger: { soft: '#7f1d1d' },
  },
} as const;

export type Tokens = typeof tokens;
export type DarkTokens = typeof darkTokens;
