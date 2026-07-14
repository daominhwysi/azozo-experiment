---
name: Azozo
description: Notion-inspired online examination and OCR token labeling system
colors:
  primary: "#373737"
  secondary: "#f7f7f7"
  foreground: "#252525"
  background: "#ffffff"
  muted-foreground: "#8f8f8f"
  border: "#ebebeb"
  destructive: "#df3a3a"
typography:
  display:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "2rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter Variable, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "6px 12px"
---

# Design System: Azozo

## 1. Overview

**Creative North Star: "The Minimalist Workspace"**

Azozo is built around Notion's signature layout and design aesthetic: a clean, quiet, and distraction-free workspace. The system prioritizes content legibility, sharp alignment, and subtle structures over heavy colors, shadows, and decoration. This minimalist layout ensures that students can focus completely during exams, teachers can grade exams with clarity, and annotators can perform precise OCR token-level actions without visual clutter.

**Key Characteristics:**
- Strict 4px vertical grid rhythm for uniform spacing.
- Monochromatic-first styling with primary gray accents.
- Subtle 1px borders as structural separators.
- Responsive, fluid layout adapted for desktop and mobile browsers.

## 2. Colors

The color palette is restricted, calm, and functional, relying on soft tints of gray to structure the user interface.

### Primary
- **Deep Ink** (#373737 / `oklch(0.205 0 0)`): Used for primary text headings, buttons, and high-emphasis controls.

### Secondary
- **Silver Silk** (#f7f7f7 / `oklch(0.97 0 0)`): Used for secondary buttons, inactive states, sidebar backgrounds, and row shading.

### Neutral
- **Canvas White** (#ffffff / `oklch(1 0 0)`): The default background for main content sheets and interactive cards.
- **Charcoal Ink** (#252525 / `oklch(0.145 0 0)`): Used for body copy and general layout text.
- **Muted Gray** (#8f8f8f / `oklch(0.556 0 0)`): Used for helper text, placeholders, and low-emphasis information.
- **Border Gray** (#ebebeb / `oklch(0.922 0 0)`): The standard 1px container border color.

**The Ten Percent Rule.** The primary accent (#373737) and active indicators are used on ≤10% of any given screen to draw focus only to the most critical actions.

## 3. Typography

**Display Font:** Inter Variable (with sans-serif fallbacks)
**Body Font:** Inter Variable (with sans-serif fallbacks)

**Character:** Standard geometric humanist sans-serif with exceptional legibility across wide range of weights, using clean, tight tracking at larger display sizes.

### Hierarchy
- **Display** (Bold (700), `2rem`, `1.2` line-height): Main dashboard header names.
- **Headline** (SemiBold (660), `1.5rem`, `1.3` line-height): Section or workspace headers.
- **Title** (Medium (500), `1.125rem`, `1.4` line-height): Exam list item names, card titles.
- **Body** (Regular (400), `0.875rem`, `1.5` line-height, capped at 65–75ch): Reading sections, question descriptions.
- **Label** (Medium (500), `0.75rem`, `0.05em` letter-spacing, uppercase/normal): Sidebar categories, status pill tags.

## 4. Elevation

Azozo is a flat, restrained system. Visual depth is established through flat background color shifts (e.g. Canvas White on Silver Silk sidebar) and clean 1px borders, rather than soft or wide shadows.

### Shadow Vocabulary
- **Flat-By-Default**: Surfaces are completely flat at rest. Subtle, low-blur shadows (e.g., `0 1px 2px rgba(0,0,0,0.05)`) are used exclusively for active modal dialogs.

## 5. Components

### Buttons
- **Shape:** Soft rounded corners (`{rounded.md}`).
- **Primary:** Deep Ink background with Canvas White text, padded by `6px 12px` (`py-1.5 px-3`).
- **Hover / Focus:** Low-opacity overlay shift, transition of `150ms`.

### Chips
- **Style:** Light gray background (`{colors.secondary}`), 1px border (`{colors.border}`), tiny text, rounded edges.

### Cards / Containers
- **Corner Style:** Rounded (`{rounded.lg}`).
- **Background:** Canvas White (`{colors.background}`).
- **Border:** 1px solid gray (`{colors.border}`).
- **Internal Padding:** Spaced uniformly (`{spacing.lg}`).

### Inputs / Fields
- **Style:** 1px stroke (`{colors.border}`), Canvas White background, soft rounded edges (`{rounded.md}`).
- **Focus:** Highlighted using a subtle border tint and clean focus ring.

### Navigation
- **Style:** Sidebar uses Silver Silk background with compact lists of items using `0.75rem` padding, highlighting active entries with deep gray backgrounds and light text.

## 6. Do's and Don'ts

### Do:
- **Do** align all structural sections to a strict 4px grid rhythm.
- **Do** use Inter Variable for all UI text to maintain Notion's geometric aesthetic.
- **Do** use solid 1px borders to separate different functional panels.

### Don't:
- **Don't** use border-left or border-right greater than 1px as a colored accent on cards, callouts, or list items.
- **Don't** use cluttered or overdesigned dashboards with multiple nested card layers or complex elevation shadows.
- **Don't** use loud gradients, glassmorphism, or neon colors.
