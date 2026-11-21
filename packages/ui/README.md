# @aiaia/ui

The AIAIA design system: React Native components (NativeWind 4) that also render on web. Design
tokens live in `src/tokens.json`; `src/tokens.ts` types them and `apps/mobile/tailwind.config.js`
reads the same file, so class names and the TS object cannot drift.

## Look

The look follows the neutral theme of [Astryx](https://github.com/meta/astryx) (MIT, see `NOTICE`):
graphite accent, Figtree type, 10 px element and 12 px container radii, low-contrast dividers, soft
layered shadows. We copy values, not code: no `@astryxdesign/*` package is installed.

Deliberate deviations from Astryx:

- **Control border.** Astryx's `border-emphasized` (`#d4d4d4`) is 1.3:1 on our surfaces, below the
  3:1 that WCAG 1.4.11 asks of input, checkbox and outline-button boundaries. `border` is the
  lightest stop of the Astryx neutral ramp that reaches 3:1 on both `surface` and `surfaceAlt`:
  `#848484` (light), `#777777` (dark). `divider` is the quiet Astryx hairline, for non-control rules.
- **Dark page background.** Astryx's dark `background-body` equals its dark card (`#1b1b1b`). We use
  `#111111` for `background` so cards stay visibly raised; `surfaceAlt` is `#262626`.
- **Touch type scale.** Phone-first, so we use Astryx's touch scale (base 16, ratio 1.1736), rounded
  to whole px, instead of the 14 px desktop base. Text pairs `fontFamily` with `fontWeight` because
  React Native needs one family name per weight.
- **Hit area.** Controls keep a 44 pt minimum target; Astryx's 28-36 px heights are desktop sizes.

## Colour roles

Every role is an opaque six-digit hex in both schemes (alpha colours are flattened over the surface).

| Role                                      | Light                                         | Dark                                          | Use                                      |
| ----------------------------------------- | --------------------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `primary` / `onPrimary`                   | `#1B1B1B` / `#FFFFFF`                         | `#F1F1F1` / `#111111`                         | Accent fill and its text                 |
| `surface`                                 | `#FFFFFF`                                     | `#1B1B1B`                                     | Cards, inputs, sheets                    |
| `surfaceAlt`                              | `#F1F1F1`                                     | `#262626`                                     | Muted fills, selected rows               |
| `background`                              | `#F1F1F1`                                     | `#111111`                                     | Page background                          |
| `text` / `textMuted`                      | `#000000` / `#474747`                         | `#FFFFFF` / `#9E9E9E`                         | Body and secondary text                  |
| `border`                                  | `#848484`                                     | `#777777`                                     | Control boundaries (3:1)                 |
| `divider`                                 | `#EBEBEB`                                     | `#323232`                                     | Hairlines between rows and cards         |
| `neutral`                                 | `#F0F0F0`                                     | `#323232`                                     | Secondary button, avatar fallback        |
| `success` / `warning` / `danger` / `info` | `#2F7D33` / `#836700` / `#C0262C` / `#0067CE` | `#90CA90` / `#EEC448` / `#FFAEA7` / `#A1CAFF` | Status text, and fills under `onPrimary` |
| `infoMuted` / `onInfoMuted`               | `#B9D7FF` / `#003978`                         | `#354252` / `#A1CAFF`                         | Banners and badges                       |
| `successMuted` / `onSuccessMuted`         | `#BCE0BB` / `#00490B`                         | `#374537` / `#90CA90`                         | Banners and badges                       |
| `warningMuted` / `onWarningMuted`         | `#FAE19E` / `#4B3900`                         | `#524620` / `#EEC448`                         | Banners and badges                       |
| `dangerMuted` / `onDangerMuted`           | `#FFC4BE` / `#76000C`                         | `#523937` / `#FFAEA7`                         | Banners and badges                       |
| `focus`                                   | `#1B1B1B`                                     | `#F1F1F1`                                     | Focus ring                               |

The other tokens: `spacing`, `radius` (`none 0`, `sm 6`, `md 10`, `lg 12`, `xl 28`, `full`),
`fontSize` (`caption`, `label`, `body`, `heading`, `title`, `display`), `fontFamily` (Figtree 400,
500, 600, 700), `elevation` (`sm`, `md`, `lg`, with `boxShadowDark` for the dark scheme), `motion`
(`fast 125`, `medium 300`, `slow 700` ms, plus two easing curves) and `minHitArea`.

`apps/mobile/app/_layout.tsx` loads the Figtree faces and falls back to the system font if loading
fails or takes longer than four seconds.

## Layout and feedback decisions

- **Page vs surface.** `Screen` and the `AdminLayout` content area are `background`; cards, sheets, dialogs, headers, toasts, the sidebar and the table body are `surface`.
- **Hairlines.** Header bottom, list dividers, table rows, the sidebar edge and the `Card` border are 1 px `divider`.
- **Card** has no resting shadow. `elevation` is now opt-in (it used to default to `sm`).
- **Radii.** `Card`, `Toast`, `ConfirmDialog` and the table frame use `lg`; `Sheet` top corners use `xl`; list rows and nav items use `md`. Rows with a `divider` stay square so the hairline runs edge to edge.
- **Scrim.** `overlays.scrim` (`#00000080` light, `#000000CC` dark) dims behind `Sheet`, `ConfirmDialog` and the admin drawer.
- **Shadows.** Every `elevationStyle` call passes the scheme: `Sheet` and `ConfirmDialog` use `lg`, `Toast` uses `md`.
- **Toast** uses the muted pair for its tone like an Astryx Banner; a neutral toast is `primary` on `onPrimary`. The message is one `label` line. No enter or exit animation, because none existed.
- **State paint.** `ListItem` (pressable), nav items, `Toast`, table rows and table checkboxes use `stateOverlay` for hover and pressed, and `focusRing(colors.focus)` for focus.
- **Admin nav.** Selected is an `overlays.fill` background with semibold `text`; unselected is `textMuted` at weight 400.
- **Table header** is `surface` with a `divider` underline and `caption` 500 `textMuted` text in sentence case. Sort direction is still shown as an arrow after the header text, because it is state, not a label.
- **Table search** keeps the outline focus ring (an existing test pins it) but in the `focus` colour.
- **Fonts on Android.** `apps/mobile/app.config.ts` embeds the four Figtree faces through the `expo-font` config plugin.
