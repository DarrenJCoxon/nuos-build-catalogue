# Colour tokens

> *Filled in during the UI/UX + Design System phase of planning. The AI walks you through this in conversation — start with brand colours, then derive a semantic palette (success, warning, danger, info), then accessibility-checked surface and text combinations.*

**Status:** 🔵 proposed
**Last updated:** {{TODAY}}

## Brand colours

[The 1-3 primary brand colours. Each as a name + a hex value + a description of when it's used.]

| Token | Hex | Used for |
| --- | --- | --- |
| `colour.brand.primary` | `#000000` | [...] |
| `colour.brand.secondary` | `#000000` | [...] |

## Semantic colours

[Roles, not specific colours. The mapping lets you change a colour later without renaming everywhere.]

| Token | Hex | Role |
| --- | --- | --- |
| `colour.surface.canvas` | `#ffffff` | The default page background |
| `colour.surface.raised` | `#fafafa` | Cards, modals, raised elements |
| `colour.text.primary` | `#1a1a1a` | Default text colour |
| `colour.text.muted` | `#666666` | Secondary text, captions |
| `colour.text.inverse` | `#ffffff` | Text on dark / brand backgrounds |
| `colour.feedback.success` | `#000000` | Positive confirmations |
| `colour.feedback.warning` | `#000000` | Caution states |
| `colour.feedback.danger` | `#000000` | Errors, destructive actions |
| `colour.feedback.info` | `#000000` | Informational notices |
| `colour.action.primary` | `#000000` | The main call-to-action |
| `colour.action.secondary` | `#000000` | Less prominent actions |

## Accessibility

[List the contrast pairs that must hold. Project-wide commitments live in `accessibility.md`; the table here documents which colour combinations are accessible.]

| Foreground × Background | Contrast | Standard met |
| --- | --- | --- |
| `colour.text.primary × colour.surface.canvas` | [4.5:1+] | AA / AAA |
| `colour.text.muted × colour.surface.canvas` | [4.5:1+] | AA / AAA |

> Test every text/background pair against [WebAIM's contrast checker](https://webaim.org/resources/contrastchecker/) or equivalent. AA is the minimum commitment; AAA where it matters.

## Dark mode (if applicable)

[Either a full second set of tokens or a transformation rule. Leave out if dark mode isn't planned for this project.]

## How to change a colour

A colour change is a design-system decision. File it as a D-NNN if the change is project-wide and load-bearing (e.g. the brand changes). Day-to-day refinements to specific hex values can happen in this file directly during early planning — once the design system reaches 🟢 active status, changes get more deliberate.
