---
name: Masulino
description: German staff workplace for an indoor playground, cool paper with one coral accent.
colors:
  primary: "#ef603b"
  primary-foreground: "#ffffff"
  orange: "#f56a43"
  sidebar-primary: "#ed623e"
  sidebar-accent: "#fff0ea"
  sidebar-accent-foreground: "#d44925"
  ring: "#ee714f"
  focus: "#ed7f5f"
  navy: "#222a44"
  ink: "#2c3040"
  ink-hover: "#151928"
  destructive: "#d34141"
  canvas: "#f6f7fa"
  background: "#ffffff"
  foreground: "#242732"
  text: "#252937"
  secondary-text: "#70798b"
  soft-text: "#747989"
  muted: "#f2f3f6"
  muted-foreground: "#6d7180"
  secondary: "#f4f5f7"
  secondary-foreground: "#353845"
  accent: "#f0f1f5"
  accent-foreground: "#262934"
  border: "#e6e7ec"
  input: "#e0e2e8"
  field-text: "#57667e"
  soft-action: "#585e70"
  nav-active: "#fff0e9"
  nav-active-text: "#c7532f"
  success: "#33775a"
  success-bg: "#eaf5ef"
  warning: "#926916"
  warning-bg: "#fff3d9"
  info: "#496ca4"
  info-bg: "#eaf1fe"
  status-orange: "#a7582c"
  status-orange-bg: "#fff0e7"
typography:
  display:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "2.15rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "1.12rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: "0em"
  label:
    fontFamily: "Inter, Aptos, Segoe UI, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.1em"
rounded:
  pill: "5px"
  sm: "6px"
  field: "7px"
  control: "8px"
  nav: "9px"
  md: "10px"
  brand: "11px"
  tile: "12px"
  surface: "13px"
  lg: "14px"
  xl: "20px"
  base: "0.7rem"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
  xl: "26px"
  page: "34px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
  button-dark:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
    height: "39px"
  button-dark-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.primary-foreground}"
  button-soft:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.soft-action}"
    rounded: "{rounded.control}"
    padding: "9px 15px"
    height: "39px"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.field-text}"
    rounded: "{rounded.field}"
    padding: "10px 12px"
    height: "38px"
  card-surface:
    backgroundColor: "{colors.background}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
    padding: "22px"
  nav-active:
    backgroundColor: "{colors.nav-active}"
    textColor: "{colors.nav-active-text}"
    rounded: "{rounded.nav}"
    padding: "10px 13px"
  pill:
    backgroundColor: "{colors.muted}"
    textColor: "{colors.secondary-text}"
    rounded: "{rounded.pill}"
    padding: "5px 8px"
---

# Design System: Masulino

## Overview

**Creative North Star: "Die Empfangstheke"**

Masulino is a staff desk, not a marketing site. The page is cool paper (`#f6f7fa`) with white working surfaces, hairline borders, and one coral accent. Headlines are Inter at a tight tracking. Density is an operations console: a fixed sidebar, a 77px top bar, and a content column capped at 1600px.

The accent is rare on purpose. Orange marks the brand, the active nav item, and the action that needs a nudge. Navy is the exception for the weather card and the concept hero, not a second brand color. Status pills carry green, blue and amber only as state, beside the orange status.

**Key Characteristics:**

- Cool paper canvas, white surfaces, 1px borders.
- One coral accent, used for brand, active navigation and the nudged action.
- Inter throughout, with tight tracking on headings and a 14px floor on operating text.
- Small radii: 8px controls, 13px surfaces, 5px pills.
- Flat at rest. Lift appears on hover, and on the navy weather card.

## Colors

The palette is a cool gray workplace with a single warm accent. Values below are the tokens in `app/globals.css` and the status colors the workspace actually paints. Historical one-off hexes in that file are not a license to invent new ones.

### Primary

- **Masulino Coral** (`primary`): Buttons in `components/ui`, links, and the focus-adjacent ring. This is the accent.
- **Brand Orange** (`orange`): The wordmark dot, the brand tile, and the notification dot.
- **Sidebar Coral** (`sidebar-primary`): The same accent tuned for the sidebar primitive.
- **Active Wash** (`nav-active` / `sidebar-accent`): The selected navigation row.
- **Active Label** (`nav-active-text` / `sidebar-accent-foreground`): Text on that row.

### Secondary

- **Desk Ink** (`ink`): The filled workspace button (`.button.dark`). Hover is `ink-hover`.
- **Navy Panel** (`navy`): Weather card and concept hero only.

### Tertiary

- **Signal Red** (`destructive`): Errors and destructive button variants.
- **Present Green** (`success` on `success-bg`): Checked-in and positive pills.
- **Waiting Amber** (`warning` on `warning-bg`): Caution notes.
- **Info Blue** (`info` on `info-bg`): Informational pills.
- **Soft Orange Status** (`status-orange` on `status-orange-bg`): Orange used as a status, not as a button.

### Neutral

- **Cool Paper** (`canvas`): The page background.
- **White Surface** (`background`): Cards, top bar, sidebar, popover.
- **Ink** (`text` / `foreground`): Headings and body.
- **Secondary Ink** (`secondary-text`): Supporting copy on working surfaces. `soft-text` and `muted-foreground` are the older muted steps.
- **Hairline** (`border`): Surface and sidebar borders. `input` is the field stroke.
- **Field Fill** (`secondary` / `muted` / `accent`): Quiet button, muted chips, and hover washes.
- **Focus Peach** (`focus` / `ring`): The 3px focus outline and the input ring.

**The One Accent Rule.** New UI uses `primary` or `orange` for the single warm accent. Navy stays on the weather card and the concept hero. Status green, blue and amber are state, not decoration.

**The Token Rule.** A new color is added in `app/globals.css` first, then named here. A polish pass does not introduce a color.

## Typography

**Display Font:** Inter (with Aptos, Segoe UI, Arial, sans-serif)
**Body Font:** Inter (with Aptos, Segoe UI, Arial, sans-serif)
**Label/Mono Font:** The same sans for labels. `ui-monospace` is only for one-time secrets on the staff gate. The brand mark glyph uses Arial.

**Character:** One neo-grotesk family. Headings sit tighter than body copy. Nothing is italic for decoration.

### Hierarchy

- **Display** (650, 2.15rem, 1.2, −0.035em): Page title. Welcome and page headings sit next to this, at 2rem and 2.2rem.
- **Headline** (650, 1.12rem, −0.035em): Section titles.
- **Title** (650, 1rem, −0.025em): Card titles and navigation groups that act as titles.
- **Body** (400, 1rem, 1.65): Default copy. Supporting lines on the desk use `secondary-text` at 0.875rem or 0.9375rem.
- **Label** (600, 0.75rem, 0.1em): Eyebrows and nav group labels. They are uppercase in tracking, not in a second typeface.

**The 14px Floor.** Actions and content on the working surfaces stay at least 14px (0.875rem). Meta may sit at 12px (0.75rem). Do not revive the older sub-12px sizes.

## Layout

The signed-in shell is a sidebar plus a fluid main column. `.main-content` is centered, max 1600px, padded 30px 34px, with 36px 44px from 1500px up. The top bar is 77px and drops to 64px under 768px.

The dashboard is a main column and a 295px side column (26px gap). Under 1040px the side column stacks or splits into two. Under 768px the sidebar becomes a drawer, stats become two columns, and toolbars stack.

Rhythm on the desk uses 8, 12, 16, 20, 26 and 34px. Forms use a two-column row that becomes one column under 375px.

## Elevation & Depth

Surfaces are flat white with a 1px hairline. Depth comes from the canvas showing between cards, not from a shadow scale. Shadows are small and cool, and they show up on hover or on the already-dark weather card.

### Shadow Vocabulary

- **Pressed ink** (`box-shadow: 0 2px 4px #24293812`): The dark workspace button at rest.
- **Card hover** (`box-shadow: 0 9px 20px #373d5010`): An app card on hover, with a 3px lift.
- **Navy lift** (`box-shadow: 0 5px 18px #222a4410`): The weather card only.

**The Flat-by-Default Rule.** A resting surface has a border and no shadow. A shadow is a hover or a dark panel, and `prefers-reduced-motion` removes the lift.

## Shapes

Controls are gently rounded, surfaces a step rounder, pills almost square. Avatars are circles. The brand tile is 11px.

- Pills and counts: 5px.
- Fields (`.field-label` input, `.choice`): 7px.
- Workspace buttons, icon buttons, search: 8px.
- Nav rows: 9px.
- shadcn `rounded-md` / theme `--radius-md`: 10px.
- Brand mark: 11px. Icon tiles: 12px.
- Workspace surfaces (`.surface`, stats row): 13px.
- Theme `--radius-lg` 14px, `--radius-xl` 20px. `--radius` is 0.7rem.
- Focus: 3px outline, 4px offset, in Focus Peach.

**The Existing Radius Rule.** Pick from this set. Do not add a new radius in a component pass.

## Components

Workspace screens are styled in `app/globals.css`. `components/ui` holds the shadcn primitives on the same tokens. Use the primitive when the screen already does. Use the workspace classes for the desk patterns below.

### Buttons

- **Shape:** Workspace buttons are 8px with a 39px minimum height. The shadcn button is 10px and 36px tall.
- **Primary:** shadcn default is Masulino Coral with white text. The desk's filled action (`.button.dark`) is Desk Ink, not coral.
- **Hover / Focus:** Dark buttons lighten to `ink-hover` and rise 1px. Focus is the 3px Focus Peach outline. shadcn focus is a 3px ring at half the ring color.
- **Secondary / Ghost:** `.button.soft` is the quiet bordered action. shadcn also has outline, secondary, ghost, link and destructive.

### Chips

- **Style:** `.pill` is 5px, 0.75rem, muted fill and secondary text.
- **State:** `.pill.green`, `.pill.orange`, `.pill.blue`, `.pill.amber` use the status pairs. A pill is a status, not a button.

### Cards / Containers

- **Corner Style:** Workspace `.surface` and `.app-card` are 13px and 11px. The shadcn card primitive is the theme's 20px `--radius-xl`.
- **Background:** White.
- **Shadow Strategy:** None at rest. App cards lift on hover. See Elevation.
- **Border:** 1px `border`.
- **Internal Padding:** 22px on `.surface`. Stats rows share one bordered shell and divide with a hairline, not nested cards.

### Inputs / Fields

- **Style:** 1px `input` stroke, white fill, 7px radius on workspace fields, 10px on the shadcn input.
- **Focus:** Border shifts toward the accent and a soft peach ring (`0 0 0 2px`).
- **Error / Disabled:** Invalid fields use `destructive`. Disabled controls drop to 0.45 opacity and lose the pointer.

### Navigation

Sidebar on white, hairline on the right. Items are 9px rows, secondary gray, 0.875rem. Hover is a cool wash. Active is Active Wash with Active Label at weight 600. Group labels are 0.75rem with wide tracking. Under 768px the sidebar is the mobile drawer, opened from the top bar.

### Brand mark

The Masulino mark in the sidebar and footer is a coral tile with an Arial glyph, 11px radius. It is not a Lucide icon. The favicon is `public/favicon.svg`.

## Do's and Don'ts

### Do:

- **Do** take color, radius and type from the tokens in this file and `app/globals.css`.
- **Do** keep operating text at least 14px and honor `prefers-reduced-motion`.
- **Do** use `lucide-react` for UI icons, stroke 1.8, at the size of the icons beside them.
- **Do** use ArrowUp for ascending and ArrowDown for descending. The icon is `aria-hidden`. The column reports direction with `aria-sort`.

### Don't:

- **Don't** add a color, radius or typeface while polishing a screen.
- **Don't** add a second icon set, or use a Unicode arrow as an icon.
- **Don't** replace the floor-plan color fields, diagrams, or the favicon with Lucide icons.
- **Don't** nest a card inside a card. Stats and summaries share one shell and divide with a hairline.
- **Don't** treat the assistant panel, campaign send, or check-in simulation as a live integration.
