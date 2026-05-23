# Design

## Visual Theme

V4 uses restrained acrylic product UI: translucent system surfaces, lagoon blue selection, graphite text, and amber only for attention. The scene is a developer glancing at a floating desktop overlay while working, usually over a busy wallpaper, so glass must maintain readability in both bright and dim environments.

## Color

- Neutrals use OKLCH-tinted porcelain in light mode and smoky graphite in dark mode.
- Primary accent is lagoon blue, used for selected navigation, primary buttons, focus, and active appearance choices.
- Amber is only for pending approvals or inputs.
- Coral is only for destructive actions.
- Reduced transparency switches acrylic surfaces to opaque equivalents.

## Typography

Use system UI fonts. Labels and data stay compact. Headings are modest, with hierarchy created by weight, spacing, and contrast rather than large display type.

## Layout

The panel has three first-class modes: Monitor, Chat, Settings. Monitor keeps the existing session-list plus detail structure. Chat uses a left conversation rail and right conversation stage. Settings uses a category rail and preference rows.

## Components

- Top route control: segmented mode switch with clear selected state.
- Acrylic surfaces: panel, sidebars, detail panes, chat stage, composer, settings panels.
- Preference controls: segmented controls for option sets, switches for booleans, compact rows for dense settings.
- Status chips: semantic tone, readable in light and dark.
- Action dock: fixed at the bottom when a selected session needs user action.

## Motion

Motion should be short and state-driven. Use opacity, transform, and color transitions only. Avoid decorative movement and layout-property animation.
