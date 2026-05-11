# [Component name]

> *Replace bracketed placeholders. Delete this hint block once filled in.*

**Status:** 🔵 proposed / 🟡 in flight / 🟢 active / ⚫ deprecated
**Last updated:** {{TODAY}}

## What it is

[One sentence. *"A button that performs an action when clicked or pressed."*]

## When to use it

[The role it plays. When this component is the right answer vs. a different one. *"Use a `button` for actions that change state. Use a `link` for navigation between surfaces."*]

## Variants

| Variant | When |
| --- | --- |
| `primary` | The main call-to-action on a surface; one per visible region maximum |
| `secondary` | Lower-priority actions |
| `destructive` | Actions that delete or undo |
| `link` | When the action is navigation rather than a state change (rare; usually use a `link` component instead) |

## States

| State | Behaviour |
| --- | --- |
| default | The resting visual |
| hover | Subtle visual feedback that the element is interactive (desktop only) |
| focus | Visible focus ring; meets WCAG focus indicator requirements |
| active | The brief moment of being pressed/clicked |
| disabled | Visually muted; not focusable; cursor: not-allowed |
| loading | After click, before the action completes; spinner replaces label; not pressable |

## Tokens consumed

- **Colour:** `colour.action.primary` (background), `colour.text.inverse` (text)
- **Typography:** `text.label.medium`
- **Spacing:** internal padding `space.3` vertical × `space.4` horizontal
- **Radius:** `radius.medium`
- **Motion:** `motion.duration.quick` with `motion.ease.standard` on hover/focus

## Accessibility

- Reachable via keyboard (Tab moves to it; Space or Enter activates)
- Has an accessible name (visible label, or aria-label if icon-only)
- Focus ring is visible and meets 3:1 contrast against the surrounding surface
- `aria-disabled` when disabled (not just the visual style)
- `aria-busy` when loading

## Examples

| Surface | How it's used |
| --- | --- |
| [Surface link] | [the variant used and what it does there] |

## Notes

[Date-stamped notes about how this component has evolved.]
