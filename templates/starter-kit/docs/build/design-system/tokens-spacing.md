# Spacing tokens

> *Filled in during the UI/UX + Design System phase of planning.*

**Status:** 🔵 proposed
**Last updated:** {{TODAY}}

## Spacing scale

A small set of consistent values used everywhere. Build everything from these. Don't introduce custom one-off values.

| Token | Value | Typical use |
| --- | --- | --- |
| `space.0` | 0 | Reset |
| `space.1` | 4px | Tight pairs (icon next to label) |
| `space.2` | 8px | Internal padding of small elements |
| `space.3` | 12px | Default gap between related items |
| `space.4` | 16px | Comfortable padding inside cards/buttons |
| `space.5` | 24px | Section padding |
| `space.6` | 32px | Between sections |
| `space.7` | 48px | Between major page regions |
| `space.8` | 64px | Hero/breathing room |
| `space.9` | 96px | Above-the-fold space |

## Layout grid

[The column system used for major page layouts. Most projects use a 12-column grid; some use 8 or 16. Pick one and stick to it.]

- **Columns:** 12
- **Gutter:** `space.4` (16px)
- **Margin:** `space.5` (24px) on mobile, `space.7` (48px) on desktop
- **Max content width:** 1200px (or as appropriate)

## Breakpoints

| Token | Width | Targets |
| --- | --- | --- |
| `bp.mobile` | up to 639px | Phones |
| `bp.tablet` | 640px – 1023px | Tablets, small laptops |
| `bp.desktop` | 1024px+ | Larger laptops, monitors |

Mobile-first by default — design for `bp.mobile`; add styling at larger breakpoints as needed.

## Principles

- **Use multiples of 4px.** The scale above is built from a 4px base. Custom values that aren't multiples of 4 produce subtle visual noise.
- **Vertical rhythm matters.** Consistent spacing between text blocks does more for legibility than any single typography choice.
- **More space than you think.** When in doubt, increase the gap. Crowded interfaces feel harder to use than they are.
