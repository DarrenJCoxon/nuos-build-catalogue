# Motion tokens

> *Filled in during the UI/UX + Design System phase of planning.*

**Status:** 🔵 proposed
**Last updated:** {{TODAY}}

## Duration scale

| Token | Value | Typical use |
| --- | --- | --- |
| `motion.duration.instant` | 0ms | Hovering between focused/unfocused |
| `motion.duration.quick` | 150ms | Hover states, focus rings, small UI feedback |
| `motion.duration.medium` | 250ms | Modal open/close, page transitions, accordion |
| `motion.duration.slow` | 400ms | Larger view transitions, complex reveals |
| `motion.duration.long` | 700ms | Onboarding moments, celebratory feedback |

## Easing

| Token | Curve | Used for |
| --- | --- | --- |
| `motion.ease.standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default; balanced acceleration + deceleration |
| `motion.ease.enter` | `cubic-bezier(0, 0, 0.2, 1)` | Things appearing on screen |
| `motion.ease.exit` | `cubic-bezier(0.4, 0, 1, 1)` | Things leaving the screen |
| `motion.ease.emphasis` | `cubic-bezier(0.2, 0.7, 0, 1)` | Big moments that should feel deliberate |

## Principles

- **Motion communicates state change**, not decoration. Every animation should answer "what just changed?"
- **Faster is friendlier for repetitive interactions.** A modal opening 60 times a day at 600ms is annoying; the same modal at 250ms feels right.
- **Slower is friendlier for rare, big moments.** A celebration animation can take 700ms; nobody minds.
- **Respect `prefers-reduced-motion`.** All non-essential motion should be substantially reduced or removed when the user has set this preference.

## Accessibility

When `prefers-reduced-motion: reduce` is set:

- Replace transition-based motion (slide, scale, fade) with instant state changes
- Keep durations for unavoidable transitions under 150ms
- No parallax, no auto-playing media

The full accessibility commitment lives in `accessibility.md`.
