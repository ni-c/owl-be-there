# Design

Warm and a little playful: cream paper by day, a deep night blue by night, an owl that changes its mood with the page. The tokens live in [`packages/client/src/styles.css`](../packages/client/src/styles.css); this page explains the ones that carry meaning.

## The calendar's colours

A calendar cell says one of three things, and none of them by colour alone:

| State      | Fill                                 | Also                                      |
| ---------- | ------------------------------------ | ----------------------------------------- |
| Can        | green                                | a check mark; `aria-pressed="true"`       |
| Maybe      | amber with white stripes             | a "?" in the cell; `aria-pressed="mixed"` |
| Not marked | the plain surface with a thin border | nothing — that is the point               |

The group view turns the same cells into a heatmap: one hue, six steps from nobody to everyone, and the count is always written in the cell. "Maybe" answers appear as "+n?" beside it.

| Step | Light     | Dark      |
| ---- | --------- | --------- |
| 0    | `#f1e8da` | `#23263f` |
| 1    | `#6fbc9f` | `#1f5a4c` |
| 2    | `#4aa685` | `#23735f` |
| 3    | `#268262` | `#389c7e` |
| 4    | `#1a7055` | `#4fb393` |
| 5    | `#0e5441` | `#86d6b8` |

Light runs light → dark and dark runs dark → light, so "more people" always means "more contrast against the page". Each step is paired with the ink that reaches 4.5:1 on it — dark ink on the light end of a ramp, light ink on the other — because the "+n?" text is small.

| Mark  | Light fill / ink      | Dark fill / ink       |
| ----- | --------------------- | --------------------- |
| Can   | `#268262` / `#ffffff` | `#2c9572` / `#0c1f18` |
| Maybe | `#e0a020` / `#2a2118` | `#b8821c` / `#1b1308` |

Green and amber stay distinguishable under protanopia, deuteranopia and tritanopia; the stripes and the "?" carry the difference for anyone for whom they do not. In forced-colours mode every marked cell gets a solid border.

## Rules

- **Text never wears a data colour.** Values and labels use the ink tokens; a coloured mark beside them carries the meaning.
- **Every pair of fill and text is checked.** The end-to-end suite runs axe in light and dark mode with unmarked, marked and heatmap cells on screen; a new state needs to appear there too.
- **Touch targets are at least 44 px.** Calendar cells grow with the screen up to 4 rem and never shrink below 2.75 rem.
- **Motion is optional.** Everything animated stops under `prefers-reduced-motion`.

## The owl

Hand-drawn SVG in [`Owl.tsx`](../packages/client/src/components/Owl.tsx), coloured with the `--owl-feather`, `--owl-belly`, `--owl-iris` and `--owl-beak` tokens, so it follows the theme. Moods: happy, thinking, sleeping, celebrating, confused. The link-preview image `og.png` is rendered with Playwright by `scripts/make-og-image.ts`.
