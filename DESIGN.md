# Codex Relay Design System

## 1. Atmosphere & Identity

Codex Relay feels like a compact remote command surface: dark, dense, and quiet,
with enough chrome to make phone-sized work feel controlled instead of cramped.
The signature is practical instrument-panel layering: dark surfaces, subtle
translucent controls, and monospace URL/code details.

## 2. Color

### Palette

| Role                | Token                            | Light     | Dark      | Usage                               |
| ------------------- | -------------------------------- | --------- | --------- | ----------------------------------- |
| Surface/primary     | `Colors.dark.background`         | `#191919` | `#191919` | Main app background                 |
| Surface/secondary   | `Colors.dark.backgroundElement`  | `#2A2A2A` | `#2A2A2A` | Panels, inputs, preview frames      |
| Surface/selected    | `Colors.dark.backgroundSelected` | `#383838` | `#383838` | Selected rows and active controls   |
| Surface/translucent | `rgba(255, 255, 255, 0.04-0.12)` | same      | same      | Toolbars, soft action wells         |
| Text/primary        | `Colors.dark.text`               | `#F2F2F2` | `#F2F2F2` | Body, labels, button text           |
| Text/secondary      | `Colors.dark.textSecondary`      | `#9A9A9A` | `#9A9A9A` | Metadata, inactive controls, hints  |
| Border/subtle       | `rgba(132, 145, 165, 0.22-0.24)` | same      | same      | Preview frames and compact toolbars |
| Status/success      | `rgba(44, 163, 111, 0.12-0.16)`  | same      | same      | Successful operational states       |
| Status/error        | `rgba(216, 79, 79, 0.08-0.16)`   | same      | same      | Destructive/error states            |
| Power/inactive      | `Colors.*.powerTrack`            | `#454545` | `#454545` | Unselected Power spectrum           |
| Power/fast          | `Colors.*.powerBlue`             | `#3E96FF` | `#3E96FF` | Faster end of the Power spectrum    |
| Power/deep          | `Colors.*.powerViolet`           | `#7868FF` | `#7868FF` | High-reasoning spectrum transition  |
| Power/ultra         | `Colors.*.powerMagenta`          | `#C06DFF` | `#C06DFF` | Ultra endpoint and peak accents     |
| Agent/identity      | `Colors.*.agent*`                | varied    | varied    | Decorative subagent identities      |

### Rules

- Prefer existing `Colors`, `Fonts`, and `Spacing` constants in React Native code.
- Keep preview/tool surfaces dark and low-contrast; use borders for containment.
- Use raw `rgba(...)` only for existing translucency patterns not represented in
  `Colors`.

## 3. Typography

### Scale

| Level      | Size | Weight | Line Height | Tracking | Usage                             |
| ---------- | ---- | ------ | ----------- | -------- | --------------------------------- |
| Title      | 48px | 600    | 52px        | 0        | Large screen titles               |
| Subtitle   | 32px | 600    | 44px        | 0        | Section-level titles              |
| Body       | 16px | 500    | 24px        | 0        | Default readable text             |
| Small      | 14px | 500    | 20px        | 0        | Labels, supporting copy           |
| Small/bold | 14px | 700    | 20px        | 0        | Compact emphasis                  |
| Code       | 12px | 400    | natural     | 0        | URLs, paths, terminal/status text |

### Font Stack

- Primary: `Fonts.sans`, `Fonts.sansMedium`, `Fonts.sansSemiBold`, `Fonts.sansBold`
- Mono: `Fonts.mono`, `Fonts.monoMedium`
- Serif: available but not part of the core app surface.

### Rules

- URLs, paths, and protocol/status text use mono.
- Buttons use sans bold or the shared `Button` text context.

## 4. Spacing & Layout

### Base Unit

All spacing derives from the existing `Spacing` constants.

| Token           | Value | Usage                       |
| --------------- | ----- | --------------------------- |
| `Spacing.half`  | 2px   | Hairline offsets            |
| `Spacing.one`   | 4px   | Tight icon/toolbar gaps     |
| `Spacing.two`   | 8px   | Compact control gaps        |
| `Spacing.three` | 16px  | Standard horizontal padding |
| `Spacing.four`  | 24px  | Panel padding               |
| `Spacing.five`  | 32px  | Larger section spacing      |
| `Spacing.six`   | 64px  | Screen-level spacing        |

### Grid

- Mobile-first stacked layouts.
- Repeated tool controls use a stable 44px interaction box; compact visual
  capsules may remain 23-30px tall inside that box to avoid layout shift.
- Preview frames use 8px radius unless an existing primitive dictates otherwise.

### Rules

- Keep control bars compact and single-row when possible.
- Text inside compact buttons must fit without truncating the primary action.

## 5. Components

### Conversation UI v2

- **Conversation first**: user turns use compact, right-aligned bubbles; assistant turns sit
  directly on the timeline without a surrounding card. Message chrome stays subordinate to the
  content.
- **Runtime activity**: command, search, thinking, tool, subagent, and file-change events enter as
  one-line summaries. File changes expand in place on request; full protocol detail remains
  available from the expanded summary.
- **Streaming scroll**: the timeline follows token and layout growth only while the reader is at
  the end. Scrolling away freezes the viewport and reveals a floating `Latest` action; returning to
  the end resumes streaming follow mode.
- **Approvals**: unresolved approvals are the strongest operational element in the timeline, with
  a warning accent and inline decisions. A resolved approval automatically collapses back to a
  quiet one-line history item.
- **Composer**: the composer is a compact docked surface with the prompt as its primary element and
  context, usage, mode, send, and stop actions on the supporting rail. Engineering surfaces such as
  Git, Terminal, Files, and Web Preview remain outside the message hierarchy.

### Compact Control Button

- **Structure**: shared `Button` with `size="icon"` or short text plus `Icon`.
- **Variants**: enabled, disabled, pressed, loading.
- **Spacing**: `Spacing.one` to `Spacing.two` gaps, stable 44px interaction box
  around compact 23-30px visible chrome.
- **States**: disabled uses reduced opacity and secondary text/icon color.
- **Accessibility**: always include `accessibilityLabel`.

### Preview Frame

- **Structure**: bordered dark container with embedded WebView/editor/terminal.
- **Spacing**: adjacent controls separated by `Spacing.two`.
- **States**: loading, error overlay, retry action, navigation controls.
- **Accessibility**: error action labels describe the result, not the visual.

### Plan Progress Banner

- **Structure**: the running turn owns one floating `Plan` surface. Its collapsed
  state keeps the active step and completion fraction on one compact row; the
  expanded state lists the individual steps.
- **Subagents**: subagent activity from the same running turn is folded into this
  surface instead of appearing as duplicate timeline cards. The collapsed row
  shows a tiny colored agent cluster and count; expansion adds one subdued
  `Subagents` summary row below the plan steps. Show at most four distinct,
  decorative identity glyphs while preserving the full detected count in text
  and accessibility labels. Glyph shape and color are assigned by visible agent
  order and never encode running, completed, interrupted, or failed state. The
  expanded status copy may wrap to two lines on compact widths so no supported
  status total is lost to truncation.
- **Scope**: only activity associated with the current plan turn is summarized.
  Subagent messages without an active plan, and activity from earlier turns,
  remain in the timeline so operational history is not lost.
- **Status**: running, completed, interrupted, and failed totals remain in the
  summary copy and spoken label, not in the decorative identity glyphs. Plan
  steps continue to use existing plan/status colors. Unknown transport statuses
  stay conservative and are treated as running until the relay reports a
  terminal state.
- **Motion**: newly detected agents fade into the summary without moving or
  resizing the banner controls. Reduced-motion follows the platform animation
  policy through the shared Reanimated configuration.
- **Accessibility**: the banner's spoken label includes both plan completion and
  subagent totals; decorative glyphs are hidden from the accessibility tree.

### Power Spectrum

- **Structure**: one 14px-radius instrument card containing a 44px action row
  (`Advanced` and a labeled Fast switch) plus a 44px gesture region. The Fast
  switch uses one touch target containing a lightning glyph, visible label, and
  a deterministic track/thumb; it must never collapse to an icon-only action.
- **Track**: 26px capsule with a 30px white thumb and one discrete stop per
  source-provided Power effort; the current canonical catalog provides six.
  The inactive segment uses `powerTrack`; the revealed segment runs
  `powerBlue → powerViolet → powerMagenta` without compressing the gradient.
- **Progressive material**: canonical stops through Max remain clean blue; the
  Max → Ultra transition smoothly reveals violet, magenta, rim light, and the
  densest sparkle field. Every source-provided stop dot remains visible across
  both the active and inactive track.
- **Interaction**: horizontal drag follows the finger continuously through a
  shallow magnetic well around every supported Power stop. A regular tap travels
  through those same wells stop by stop instead of jumping directly to its target.
  Each well gently compresses motion and pulses the thumb; drag release settles
  to the nearest stop. Haptic feedback fires once per crossed stop, becoming light
  at the penultimate stop and medium at Ultra. The label previews locally during
  movement, while persistence runs once after the interaction settles.
- **Accessibility**: the spectrum is a 44px `adjustable` control with
  increment/decrement actions and a spoken model/effort value. The Advanced and
  Fast actions each retain a 44px target even when their visible chrome is
  compact. Fast is exposed as one `switch` with a checked state and the hint
  `1.5x speed, more usage`; decorative icon, track, and thumb remain inside that
  single accessibility element.
- **Adaptive motion**: Ultra particles twinkle with staggered Reanimated
  opacity/scale loops. Reduced-motion keeps the same snapped values, colors,
  particles, and haptics but removes interpolation and twinkle loops. Fast uses
  a short Reanimated thumb transition to communicate state; reduced-motion
  applies the final switch state immediately.
- **Forward compatibility**: model, reasoning, and speed values from the relay
  remain non-empty opaque strings in catalog and preference storage. Compact
  Power projects the first eligible default catalog model, falling back to the
  first eligible source model, and preserves its effort order without a local
  model/effort candidate table. Advanced preserves the selected model's source
  order. Visible effort labels are derived from opaque IDs (`xhigh` becomes
  `Extra High`) and never collapse to blank; the spoken Power value keeps the
  catalog model plus effort. `Max` remains user-facing in both surfaces. Only
  the legacy SDK launch boundary narrows reasoning to the SDK's supported set.
- **Advanced return path**: whenever compact Power is available, Advanced shows
  a 44px header back action that returns to the gesture/detent control without
  closing the sheet. A valid Power selection is preserved; an opaque custom
  selection uses the existing default Power detent so the compact thumb and
  label cannot disagree. The Advanced root begins directly with Model, Effort,
  and Speed; it must not promote `Reset to default` as a leading action. If a
  separate reset is introduced later, it belongs after those settings as a
  low-emphasis footer action and must not double as navigation.
- **Sheet sizing**: compact Power and the three-row Advanced root use measured
  content height. Advanced sections can grow and scroll up to the 94% maximum;
  collapsed controls must never inherit that expanded empty height.

## 6. Motion & Interaction

### Timing

| Type     | Duration  | Easing      | Usage                     |
| -------- | --------- | ----------- | ------------------------- |
| Micro    | 100-150ms | ease-out    | Press/haptic feedback     |
| Standard | 200-300ms | ease-in-out | Panel and tab transitions |

### Rules

- Prefer haptic selection on explicit toolbar actions.
- Power uses gesture-driven transform/opacity animation only. Crossing a
  discrete stop triggers local preview and haptic feedback; the durable
  preference write happens once when the gesture settles.
- Increased spectrum color and particle density communicate proximity to Ultra.
  Only the Ultra sparkle field loops, using staggered opacity/scale phases; all
  lower stops remain still.
- Keep new preview actions synchronous-looking: loading state, then either URL
  switch or inline error.

## 7. Depth & Surface

### Strategy

Mixed, but restrained: dark tonal surfaces with subtle borders; no decorative
shadows in preview/tool surfaces.

| Type           | Value                           | Usage                          |
| -------------- | ------------------------------- | ------------------------------ |
| Preview border | `1px rgba(132, 145, 165, 0.22)` | WebView/editor frames          |
| Soft toolbar   | `rgba(255, 255, 255, 0.055)`    | Bottom/control strips          |
| Soft action    | `rgba(255, 255, 255, 0.08)`     | Icon wells and compact actions |
