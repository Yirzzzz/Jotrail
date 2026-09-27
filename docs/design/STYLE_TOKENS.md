# Style Tokens

These are implementation guidelines, not a pixel-perfect mandate.

## 1. Color philosophy

Primary direction: warm neutral light theme with a restrained green/earth accent family.

Suggested CSS variables:

```css
:root {
  --bg-app: #f7f7f4;
  --bg-surface: #ffffff;
  --bg-subtle: #f2f3ef;
  --bg-warm: #f7f1e8;

  --text-primary: #191b18;
  --text-secondary: #686d66;
  --text-tertiary: #969b94;

  --border: #e6e8e2;
  --border-strong: #d9ddd5;

  --accent: #54785e;
  --accent-soft: #e5eee6;
  --accent-warm: #b66d35;
  --accent-warm-soft: #f5e7d8;

  --success: #4f8b5c;
  --warning: #b9823d;
  --danger: #b65d55;
}
```

Do not multiply accent colors merely to distinguish object types.

### Dark theme

Implemented; see `src/styles/tokens.css` for the authoritative values and
`DECISIONS.md` D-027 for the reasoning.

The dark theme redefines the same token names under `[data-theme='dark']` on
`<html>`. Components never reference a theme, so there is exactly one place to
change a colour.

Rules that matter more than the specific hex values:

- **Warm charcoals, not neutral grey and not pure black.** The surfaces keep the
  light theme's slight green/earth warmth.
- **Keep the light theme's surface relationship.** `--bg-app` stays *darker* than
  `--bg-surface`, so the reading column still lifts off the chrome. Do not invert
  the ramp.
- **The accent lightens rather than staying put.** `#54785e` is a foreground
  colour designed against white and fails contrast on a dark surface; the dark
  theme moves the same hue up in luminance (`#7fae89`).
- **"Soft" fills become low-alpha tints, not pale solids.** A pastel that reads as
  a quiet wash on white glows on charcoal.
- **`--accent-contrast` is the text colour on a filled accent surface.** It is
  white on light and near-black on dark. Never hard-code `#fff` on an accent fill.
- **Depth comes from borders.** A black shadow is close to invisible on a dark
  surface, so borders and whitespace do even more of the work than they do on
  light.

`color-scheme` is set in both blocks so native scrollbars, form controls and the
text caret follow the theme.

## 2. Typography

Prefer system fonts so the desktop app feels native and avoids bundled-font complexity.

Suggested stack:

```css
font-family:
  Inter,
  ui-sans-serif,
  -apple-system,
  BlinkMacSystemFont,
  "Segoe UI",
  "PingFang SC",
  "Hiragino Sans GB",
  "Microsoft YaHei",
  sans-serif;
```

For editorial Journey titles, a restrained serif is optional, but do not mix too many families.

## 3. Type scale

- Hero Journey title: 30–36 px / 700
- Page title: 26–30 px / 650
- Section heading: 13–14 px uppercase/tracked or 18–20 px title style
- Body: 14–16 px
- Metadata: 12–13 px
- Reading note body: 16–18 px, relaxed line-height

## 4. Spacing

Use an 8 px base rhythm where practical:
- 4
- 8
- 12
- 16
- 24
- 32
- 40
- 48

Prefer larger whitespace between narrative sections than between controls.

## 5. Radius

Suggested:
- small control: 8 px
- surface/card: 12–16 px
- major hero/cover: 16–20 px

Avoid making every element a pill.

## 6. Shadows

Very subtle only:

```css
box-shadow: 0 1px 2px rgba(20, 24, 20, 0.04),
            0 6px 20px rgba(20, 24, 20, 0.04);
```

Borders and whitespace should do more work than shadows.

## 7. Timeline

- line: muted neutral or accent-soft
- dot: small, clear, aligned with content
- important milestone dot may grow modestly
- date column should be visually stable

## 8. Motion

- 120–180 ms UI transitions
- no bouncy animations
- no celebratory confetti for task completion
- respect reduced-motion preference
