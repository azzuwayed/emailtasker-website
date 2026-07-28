# Changelog

Simple, customer-facing changes in EmailTasker releases.

## [Unreleased]

## [0.4.0] - 2026-07-28

### Added

- **Use EmailTasker without connecting email.** Tasks, the calendar and the assistant now work on
  their own, so you can start the moment you sign in. Everything you add lives under **Personal**, and
  you can connect a Microsoft mailbox later — or never — without losing anything.
- **Snooze a task for later, and delete one for good.** Snoozed work leaves the board and waits in the
  drawer with the time it comes back; you can wake it early whenever you like. Deleting asks once, in
  place, and offers Undo — and a deleted task stays deleted instead of reappearing at the next sync.
- **Real deadlines.** Tasks now carry a proper date and time, so the board puts overdue work first and
  shows at a glance what's due today. A deadline the app can't pin down still shows exactly what the
  email said.
- **Edit a task without leaving the board.** Editing happens on the card itself — the rest of your day
  stays on screen. Unsaved changes are never thrown away without asking, and if a save fails your
  wording is kept so you can pick up where you left off.
- **Change a task's priority or open its email from the card menu**, without opening the editor.
- **See more than today.** The calendar switches between one day, three days, and seven, and you can
  page forward through the next two weeks.
- **All-day events are no longer hidden.** Holidays, out-of-office days, and multi-day trips now
  appear on their own strip above the hours, rather than being dropped.
- **A Join button when a meeting is starting.** If your next meeting has an online link, it appears
  at the top of the screen from five minutes before — one click, no hunting.
- **Edit a meeting where it sits.** Clicking a meeting opens it in place instead of a dialog, with
  who organised it and who is coming. If it has guests, EmailTasker says so before you save.
- **Drag a task to a different priority.** Grab the handle on the left of a card and drop it in
  another column; the keyboard menu does the same thing.
- **Clear explanations before EmailTasker uses a saved sign-in** — see what a stored credential is
  needed for before it's read, and choose how often you're asked.
- **A choice of where credentials are kept** — stay with your Mac's Keychain, or switch to files on
  this Mac if the Keychain doesn't work for you. Settings explains the trade-off before you choose.

### Fixed

- **Your local data is protected during an update.** EmailTasker will no longer start over with an
  empty database if it can't upgrade the one you have — your tasks, edits, and snoozes stay put. When a
  database genuinely can't be opened, it is now set aside rather than deleted.
- **Your mail is only ever processed once.** Occasionally Microsoft asks for a full re-sync, which used
  to re-run analysis over mail already handled — bringing back tasks you had cleared and spending AI
  units on work already done.
- **Snoozed tasks come back.** A snoozed task used to disappear for good with no way to find it again.
- **Completing a task now updates everywhere at once**, including when the app is tucked away in the
  menu bar.
- **Calendar problems no longer take the whole screen with them.** A calendar that fails to load leaves
  your tasks exactly where they were.
- **Editing an event can't quietly overwrite someone else's change.** If the event moved while you had
  it open, EmailTasker tells you and refreshes instead of saving over it.
- **EmailTasker now recovers when your Mac's Keychain isn't available.** Refusing the macOS
  permission prompt previously stopped the app from opening at all, with nothing on screen. You now
  get an explanation, guidance, and a way to try again — and nothing is deleted.
- Signing out, removing an account, and disconnecting a tool now finish even if the Keychain refuses,
  instead of leaving you stuck.
- Your offline access to Pro is no longer lost when the Keychain is temporarily unavailable.

## [0.3.0] - 2026-07-27

### Added

- **Included with Pro** — sign in with an active azzuwayed Pro membership to use EmailTasker, with
  clear help when payment, renewal, or a device seat needs attention.
- **Personalized task sorting** — tell EmailTasker what matters using your focus, categories, and
  sender or subject rules, then review and correct its choices.
- **Better AI controls** — see monthly usage more clearly, hide the balance when you prefer, and add
  more units when needed.

### Changed

- **Smoother verification** — brief connection problems no longer interrupt recently verified Pro
  members.
- **Easy return after renewal** — renew Pro and return to your existing workspace without reconnecting
  your Microsoft accounts.

## [0.2.0] - 2026-07-26

### Added

- **One Today view** — bring tasks, mail, and meetings from all your connected Microsoft accounts
  into one calm workspace.
- **A capable assistant** — ask about your day, find useful mail, remember your preferences, and get
  help taking action.
- **Actions with confidence** — undo everyday changes and review important actions before they happen.
- **Controls that fit you** — choose how independently the assistant works, manage what it remembers,
  and set a daily AI usage limit.

### Changed

- **A more useful start to the day** — EmailTasker prepares connected accounts in the background and
  refreshes Today when new work arrives.
- **A clearer cockpit** — work from the priority board, calendar timeline, assistant, reader, and
  simpler settings in one focused design.
- **Simple updates** — install new versions from inside EmailTasker.

### Fixed

- Improve assistant conversations, retries, action cards, and message formatting.
- Show clearer guidance when a Microsoft account needs attention.
