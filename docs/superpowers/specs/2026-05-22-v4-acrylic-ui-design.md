# V4 Acrylic UI Design

## Context

Phoenix Pet Island is a desktop overlay app anchored by an animated pet. The pet is the entry point. The floating panel is the workspace for monitoring AI tool sessions, chatting with the pet assistant, and managing preferences.

The current implementation already has a pet trigger, a floating panel, session monitoring, settings, and a local lightweight chat. V4 keeps the approved interaction direction and replaces the visual system with CSS-level acrylic glass, theme selection, and a clearer three-mode product structure.

Reference mockups:

- `design/mockups/v4/acrylic-monitor-light-strong-glass.png`
- `design/mockups/v4/acrylic-chat-dark.png`
- `design/mockups/v4/acrylic-settings-light-strong-glass.png`

## Goals

- Implement V4 as a layered refactor, not a one-shot rewrite.
- Keep Monitor mode structurally consistent with the current session page.
- Make Chat a complete first-class mode similar to a compact ChatGPT interface.
- Add an Appearance settings section with Light, Dark, and Follow System.
- Implement CSS acrylic glass first. Native window-level vibrancy is out of scope for this phase.
- Preserve existing pet behavior, drag behavior, session polling, approval actions, integrations, pet import, and local storage behavior.

## Non-Goals

- No real model API integration for chat in this phase.
- No native Tauri window vibrancy or platform-specific blur in this phase.
- No redesign of approval semantics or session data contracts.
- No unrelated Rust backend refactor.
- No new dependency unless the existing code cannot reasonably support the feature.

## Product Structure

The panel has three top-level modes:

- `监控`: tool session monitoring.
- `聊天`: independent pet assistant chat.
- `设置`: preferences and integration management.

The route IDs should become:

- `monitor`
- `chat`
- `settings`

Compatibility note: existing saved state or code paths using `sessions` should map to `monitor`.

## Pet Entry Behavior

- Clicking the pet opens the last used mode when there is no pending user action.
- If any session needs approval or input, clicking the pet opens Monitor mode and selects the pending session.
- Right-clicking the pet opens the quick menu.
- The quick menu contains: switch pet, chat, settings, quit.
- Drag behavior, pass-through behavior, and animation behavior remain unchanged.

## Monitor Mode

Monitor mode preserves the current session page structure:

- Left column: session list.
- Right column: selected session detail.
- Detail scroll area:
  - current session summary.
  - current message.
  - status chips.
  - history timeline.
- Fixed bottom action dock appears when actions are available.

Required copy changes:

- Navigation label changes from `会话` to `监控`.
- Session list header remains count-based, e.g. `3 个会话`, `1 个待处理`.
- Timeline title remains `会话动态`.

Approval behavior:

- If the selected session needs approval, the approval notice and actions remain visible at the bottom.
- `批准` and `本次会话允许` are primary actions.
- `拒绝` is a destructive action.
- Amber is used only for attention state, not for normal primary actions.

## Chat Mode

Chat mode becomes a first-class ChatGPT-like mode.

Layout:

- Left sidebar:
  - `对话` title.
  - `新对话` button.
  - search field.
  - conversation rows.
  - compact monitor status strip, e.g. `1 待审批 · 2 运行中`.
- Right conversation stage:
  - header: `Tuxie Chat`.
  - assistant status pills, e.g. `本地助手`, `上下文独立`.
  - message stream.
  - composer.

Composer behavior:

- Enter inserts a newline.
- Cmd/Ctrl + Enter sends.
- Send button sends.
- Empty or whitespace-only messages do not send.

Data model:

Chat data remains local for this phase and is stored in `localStorage`.

The current flat message list should evolve toward:

```js
{
  conversations: [
    {
      id: string,
      title: string,
      messages: [
        {
          id: string,
          role: "user" | "assistant",
          text: string,
          timestamp: string
        }
      ],
      createdAt: string,
      updatedAt: string
    }
  ],
  selectedConversationId: string
}
```

Migration:

- Existing flat `phoenix-pet-chat` messages should be migrated into one default conversation.
- If no chat data exists, create a default empty conversation.

Reply behavior:

- Keep the current local lightweight reply logic.
- It can read current monitor/session state for status answers.
- It should remain replaceable by a future real model API.

## Settings Mode

Settings mode uses a preference-panel structure.

Categories:

- `外观`
- `显示`
- `宠物`
- `集成`

Default category:

- `外观`

Appearance settings:

- Theme:
  - `浅色`
  - `深色`
  - `跟随系统`
- `降低透明度`
- `增强对比度`
- `毛玻璃强度`
  - `low`
  - `medium`
  - `high`
- Primary accent swatch, fixed to lagoon blue for this phase.

Existing settings:

- Existing display toggles remain.
- Existing pet import, rename, select, and remove behavior remain.
- Existing integration refresh and focus behavior remain.

## Theme System

User settings should include:

```js
{
  appearanceMode: "system" | "light" | "dark",
  reduceTransparency: boolean,
  increaseContrast: boolean,
  glassStrength: "low" | "medium" | "high"
}
```

Defaults:

```js
{
  appearanceMode: "system",
  reduceTransparency: false,
  increaseContrast: false,
  glassStrength: "medium"
}
```

Storage:

- These fields are added to the existing `phoenix-pet-settings` object.
- Existing setting fields, imported pets, renamed pets, and current pet selection must survive normalization.
- Missing appearance fields are filled from defaults during `normalizeUserSettings`.

Computed theme:

- `light`: force light theme.
- `dark`: force dark theme.
- `system`: use `window.matchMedia("(prefers-color-scheme: dark)")`.
- System theme changes update the UI while the app is running.

DOM representation:

- Apply theme attributes to the app root or document root:
  - `data-theme="light" | "dark"`
  - `data-appearance-mode="system" | "light" | "dark"`
  - `data-glass-strength="low" | "medium" | "high"`
  - `data-reduce-transparency="true" | "false"`
  - `data-increase-contrast="true" | "false"`

## Acrylic Visual System

V4 implements CSS-level acrylic glass:

- semi-transparent panel surfaces.
- `backdrop-filter: blur(...) saturate(...)`.
- translucent borders.
- inner highlights.
- soft shadows.

Light theme:

- milky porcelain acrylic.
- graphite text.
- lagoon blue accent.
- amber only for attention.
- coral only for destructive actions.

Dark theme:

- smoky graphite acrylic.
- light text.
- lagoon blue accent.
- amber only for attention.
- coral only for destructive actions.

Reduced transparency:

- Disable large-surface `backdrop-filter`.
- Use opaque surfaces.
- Preserve layout and component hierarchy.

Increased contrast:

- Stronger text contrast.
- Stronger borders.
- More visible focus rings.
- Slightly less transparent status surfaces.

## Components

Panel shell:

- 12px radius.
- acrylic background.
- fixed max dimensions similar to current panel.
- no nested decorative cards.

Segmented mode switch:

- labels: `监控`, `聊天`, `设置`.
- active state uses lagoon blue.
- inactive state remains neutral.

Session row:

- provider mark.
- title.
- subtitle.
- phase pill.
- selected row uses accent tint.

Chat message:

- assistant: neutral acrylic surface.
- user: lagoon-blue tinted surface.
- no oversized bubble radius.

Settings row:

- label.
- description.
- control.
- no card grid.

## Accessibility

- All interactive controls remain reachable by keyboard.
- Focus rings are visible in both light and dark themes.
- `reduceTransparency` provides a readable fallback for users sensitive to blur or low contrast.
- `increaseContrast` improves text and border contrast.
- Theme controls use visible selected states, not color alone.
- Chat message composer preserves keyboard send behavior.

## Testing and Verification

Automated:

- `pnpm build`
- `pnpm test:approval`

Manual:

- Open the app in browser preview.
- Verify Monitor mode in light and dark themes.
- Verify Chat mode in light and dark themes.
- Verify Settings appearance controls update the UI immediately.
- Verify `system` follows `prefers-color-scheme`.
- Verify `reduceTransparency` disables acrylic blur.
- Verify `increaseContrast` improves contrast without breaking layout.
- Verify existing approval actions still work.
- Verify existing pet settings still work.
- Verify existing integration refresh/focus controls still work.

## Implementation Phasing

Phase 1:

- Add theme settings and computed theme attributes.
- Rename route label and route ID compatibility from sessions to monitor.
- Add Appearance category.

Phase 2:

- Replace current dark-only CSS tokens with V4 light/dark acrylic tokens.
- Add reduced transparency and increased contrast variants.
- Preserve current Monitor layout.

Phase 3:

- Upgrade Chat mode to sidebar plus conversation stage.
- Migrate flat chat history to conversation history.

Phase 4:

- Polish Settings mode with appearance controls and existing categories.
- Run verification.

## Open Follow-Up

Native Tauri window vibrancy is intentionally deferred. After the CSS V4 implementation is stable, evaluate platform support for real window-level acrylic/vibrancy and add graceful fallbacks for unsupported systems.
