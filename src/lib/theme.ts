import { Badge, Button, Combobox, Drawer, Input, Menu, Notification, Paper, Popover, createTheme, type CSSVariablesResolver } from '@mantine/core'

// The wmekit.com look (../wazetools): Rubik, chunky ink outlines and hard shadows. The `kit-*`
// classes below are styled in styles.css; colours come from its `--kit-*` palette. Semantic
// colours (red errors, green success) stay Mantine's own.

const FONT = "'Rubik Variable', system-ui, sans-serif"

export const theme = createTheme({
  fontFamily: FONT,
  headings: { fontFamily: FONT, fontWeight: '700' },
  defaultRadius: 'md',
  // Green, not wmekit.com's yellow. Darker shade in light mode so links stay readable on the yellow ground.
  primaryColor: 'green',
  primaryShade: { light: 9, dark: 6 },
  // Mantine draws dark-mode inputs, pills, hovers, borders and disabled states from this scale.
  // Its default is neutral grey; this one is tinted to the site's night palette (--kit-card is
  // #2e2e4a, --kit-ground #23233a) so those parts don't look grey next to the cards.
  colors: {
    dark: ['#e4e2f5', '#b9b6cf', '#8f8ca8', '#6b6889', '#4a4868', '#3b3a58', '#25253c', '#2e2e4a', '#1c1c30', '#121222'],
  },
  components: {
    // Also Modal/Drawer content and Card, which are built on Paper.
    Paper: Paper.extend({ classNames: { root: 'kit-paper' } }),
    Button: Button.extend({
      classNames: { root: 'kit-btn' },
      // Plain buttons take the site's colours (green filled); ones given a `color` (red "Delete" etc.) keep it.
      vars: (_theme, { variant = 'filled', color }) => {
        if (color) return { root: {} }
        if (variant === 'filled') {
          return { root: { '--button-bg': 'var(--kit-green)', '--button-hover': 'var(--kit-green)', '--button-color': 'var(--kit-ink)' } }
        }
        if (variant === 'default' || variant === 'light') {
          return { root: { '--button-bg': 'var(--kit-card)', '--button-hover': 'var(--kit-card)', '--button-color': 'var(--kit-text)' } }
        }
        return { root: {} }
      },
    }),
    // Every input (TextInput, Textarea, Select, MultiSelect…) is built on Input.
    Input: Input.extend({ classNames: { input: 'kit-input' } }),
    Popover: Popover.extend({ classNames: { dropdown: 'kit-pop' } }),
    // Built on Popover, but take their own classNames.
    Menu: Menu.extend({ classNames: { dropdown: 'kit-pop' } }),
    Combobox: Combobox.extend({ classNames: { dropdown: 'kit-pop' } }),
    Drawer: Drawer.extend({ classNames: { content: 'kit-drawer' } }),
    Notification: Notification.extend({ classNames: { root: 'kit-pop' } }),
    Badge: Badge.extend({ classNames: { root: 'kit-tag' } }),
  },
})

// Surfaces (Paper, inputs, dropdowns) are the site's cards; the page itself is `--kit-ground`
// (set on body in styles.css).
export const cssVariablesResolver: CSSVariablesResolver = () => {
  const vars = {
    '--mantine-color-body': 'var(--kit-card)',
    '--mantine-color-text': 'var(--kit-text)',
    '--mantine-color-dimmed': 'var(--kit-muted)',
    '--mantine-color-default': 'var(--kit-card)',
  }
  return { variables: {}, light: vars, dark: vars }
}
