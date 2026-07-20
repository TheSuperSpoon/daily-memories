# Memories UI reference ledger

The implementation reuses interaction and composition patterns only. Colors, type,
radius, borders, and shadows stay within the existing Memories visual system.

| Product element | Reference | Reused pattern | Local visual tokens |
|---|---|---|---|
| Add-memory modal | [Dribbble Media Upload Modal](https://dribbble.com/shots/17949053-Media-Upload-Modal-UI-Design-SaaS-Product) | Media choice first, preview/metadata block, details beneath, removable chips | Existing lilac paper card, `#6f35b4` action, 26px radius |
| Media preview and state | [shadcn Attachment](https://ui.shadcn.com/docs/components/base/attachment) | Media icon/preview, filename and size, remove action, explicit progress/error copy | `#eee7ff` attachment surface and existing purple border |
| Modal hierarchy | [shadcn Dialog](https://ui.shadcn.com/docs/components/base/dialog) | Backdrop, labelled title, scrollable content, persistent footer actions, explicit close | Existing translucent white paper and lavender shadow |
| Beijing/West Coast selector | [shadcn Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group) | Single pressed item, equal-width choices, `aria-pressed`, state beyond color | Purple border plus filled lilac selected state and sun/moon glyph |
| Voice-note player | [Dribbble Audio Player](https://dribbble.com/shots/27230198-Audio-Player-Mobile-App-UI-Design-Clean-Podcast-Streaming-UX) | Dominant circular play control, one progress rail, current/total time | Existing Memories gradient, purple action, muted body color |
| Monthly timeline | [Dribbble Memory Recap](https://dribbble.com/shots/27152756-Memory-Recap-Social-Journal-App-UI-UX-Design) | Story-first monthly grouping, visual media cards, compact identity metadata | Existing vertical timeline, white cards, lilac page background |

Accessibility is part of the reused patterns: keyboard-operable actions, labelled
icon buttons, visible focus, error text in addition to color, and a stacked mobile
layout for media, timezones, and form actions.
