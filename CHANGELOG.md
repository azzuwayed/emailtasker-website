# Changelog

Public user-facing changes in EmailTasker releases. EmailTasker's private source changelog is
canonical; the local release workflow copies each dated release section here.

## [Unreleased]

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
