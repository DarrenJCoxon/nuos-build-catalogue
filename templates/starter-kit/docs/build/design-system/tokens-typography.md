# Typography tokens

> *Filled in during the UI/UX + Design System phase of planning.*

**Status:** 🔵 proposed
**Last updated:** {{TODAY}}

## Font families

| Token | Value | Used for |
| --- | --- | --- |
| `font.sans` | `[font name]`, system-ui, sans-serif | Body text, UI |
| `font.serif` | `[font name]`, serif | Long-form reading (if applicable) |
| `font.mono` | ui-monospace, monospace | Code, numerical alignment |

## Type scale

| Token | Size | Line height | Weight | Used for |
| --- | --- | --- | --- | --- |
| `text.display.large` | 56px | 1.1 | 700 | Hero headings |
| `text.display.medium` | 40px | 1.15 | 700 | Section headings |
| `text.title.large` | 28px | 1.2 | 600 | Page titles |
| `text.title.medium` | 22px | 1.25 | 600 | Subheadings |
| `text.body.large` | 18px | 1.5 | 400 | Lead paragraphs |
| `text.body.medium` | 16px | 1.5 | 400 | Default body |
| `text.body.small` | 14px | 1.5 | 400 | Captions, hint text |
| `text.label.medium` | 14px | 1.3 | 500 | Form labels, button text |
| `text.label.small` | 12px | 1.3 | 500 | Tags, badges |

> Adjust the scale as needed. A few principles: keep the scale modular (each step a constant ratio from the next, e.g. 1.25× or 1.333×); cap the largest size at what's legible on the smallest target screen; line height tightens as text gets bigger.

## Weight scale

| Token | Numeric | Used for |
| --- | --- | --- |
| `weight.regular` | 400 | Body |
| `weight.medium` | 500 | Labels, emphasis |
| `weight.semibold` | 600 | Titles |
| `weight.bold` | 700 | Display, strong emphasis |

## Notes on readability

- **Body text is the default.** Optimise for `text.body.medium` first; everything else is built around it.
- **Line length matters as much as type size.** Aim for 60-80 characters per line in body text.
- **Headings should be readable at glance.** A large heading that takes effort to parse is worse than a smaller one.
- **Test on the target devices.** Type that works on a designer's 27" monitor often fails on a 13" laptop or a phone in bright sunlight.
