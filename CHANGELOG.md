# Changelog

Public user-facing changes in EmailTasker releases. EmailTasker's private source changelog is
canonical; the local release workflow copies each dated release section here.

## [Unreleased]

## [0.3.0] - 2026-07-27

### Added

- **Pro membership access** — require an active azzuwayed Pro membership and registered device before
  opening the cockpit, with first-use, payment-pending, expired, device-limit, and renewal recovery
  journeys in English and Arabic.
- **Offline verification grace** — continue verified Pro access for up to 24 hours during a Hub
  outage, never beyond the paid membership end, with an in-app deadline notice.
- **Task Intelligence** — define focus, categories, and sender or subject rules; review classification
  history, correct results, undo learning, and reclassify existing tasks.
- **Workflow automation foundation** — add encrypted schedules, filters, AI steps, shared tool
  actions, durable run history, and a development-only visual builder.

### Changed

- **Native authorization** — enforce Pro access in Rust for IPC, sync, workflows, agent tools, and
  writes; locked launches do not mount or reveal cached product surfaces.
- **Device identity** — share one stable physical-Mac identity across Hub-integrated native apps and
  preserve existing EmailTasker registrations during migration.
- **AI cache privacy** — let the Hub derive opaque app, user, thread, and turn cache identities instead
  of accepting caller-owned provider cache keys.
- **AI balance controls** — show monthly quota progress, allow the balance display to be hidden, and
  keep recharge recovery visible when units are exhausted.

## [0.2.0] - 2026-07-26

### Added

- **Today cockpit** — combine mail-derived tasks, manual tasks, and calendar events from multiple
  connected Microsoft accounts into one structured daily workspace.
- **Local-first AI assistant** — search cached mail and tasks, inspect the calendar, remember
  preferences, reopen conversations, and work with explicitly connected MCP tools.
- **Safe assistant actions** — apply reversible task, mail, and calendar changes with Undo; show
  durable confirmation cards for sensitive or irreversible work.
- **AI controls** — opt into email-to-task extraction, choose an autonomy mode, manage memories and
  connected tools, inspect advanced diagnostics, and limit automatic daily AI-unit spend.

### Changed

- **Local encrypted state** — keep mailbox-derived cache data, durable tasks, AI transcripts,
  memories, action history, and MCP grants in encrypted on-device stores.
- **Background preparation** — synchronize connected accounts in Rust while the window is hidden and
  refresh the cockpit when local task data changes.
- **Cockpit design** — replace the original mailbox-oriented screen with the compact Today interface,
  docked assistant, task editors, timeline, reader, and reorganized settings.
- **Production distribution** — ship universal Developer ID-signed and Apple-notarized macOS
  installers with signed in-place updates.

### Fixed

- Improve assistant transcript continuity, context compaction, cancellation, retry behavior, action
  cards, markdown rendering, and diagnostic accuracy.
- Detect missing Microsoft permissions before Graph operations fail and isolate debug credentials
  from release Keychain data.
