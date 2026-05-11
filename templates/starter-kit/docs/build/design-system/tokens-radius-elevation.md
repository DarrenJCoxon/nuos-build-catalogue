# Radius and elevation tokens

> *Filled in during the UI/UX + Design System phase of planning.*

**Status:** 🔵 proposed
**Last updated:** {{TODAY}}

## Border radius

| Token | Value | Typical use |
| --- | --- | --- |
| `radius.none` | 0 | Sharp corners (full-width banners, separators) |
| `radius.small` | 4px | Small UI elements (tags, badges, inputs) |
| `radius.medium` | 8px | Cards, buttons, modals |
| `radius.large` | 16px | Feature cards, prominent containers |
| `radius.full` | 9999px | Pills, avatars, circular buttons |

## Elevation / shadow

Shadows are used to indicate hierarchy and interactivity — what's pressable, what's floating, what's pinned.

| Token | Value | Used for |
| --- | --- | --- |
| `elevation.none` | none | Default; in-flow elements |
| `elevation.low` | `0 1px 2px rgba(0,0,0,0.05)` | Cards, raised surfaces |
| `elevation.medium` | `0 4px 8px rgba(0,0,0,0.08)` | Hover states, popovers |
| `elevation.high` | `0 8px 24px rgba(0,0,0,0.12)` | Modals, dropdowns |
| `elevation.highest` | `0 16px 48px rgba(0,0,0,0.16)` | Notifications, toasts (briefly) |

## Principles

- **Pick a small set and use it consistently.** Two or three elevation levels usually beats five. Hierarchy is communicated by *which* level something uses, not by having many.
- **Shadows belong on light surfaces.** On dark themes, the analog is a subtle border or a brighter background rather than a shadow.
- **Radius is part of brand voice.** Sharp corners feel different from rounded ones. Pick once; apply consistently. A button that's `radius.medium` and a card that's `radius.large` is fine; a button that's `radius.medium` in one place and `radius.small` in another is design drift.
