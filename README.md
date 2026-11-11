# Kakeibo

A calm, offline-first home budget inspired by the Japanese practice of mindful money. Pause before a purchase, give it one of four categories, and see what remains spendable. No account or network connection is required.

## What is here

- **Home:** spendable-left ring, monthly spendable calculation, category totals and bars, five recent expenses, and a one-tap add action.
- **Month calendar:** tap the month in the header to open a date grid. Days are tinted by relative spending; selecting a day shows its total and entries. It follows the configured budget start day, including mid-month periods.
- **Add expense:** amount keypad, category chips, one-tap *Needed it / Wanted it / Regret*, and today's date by default. Amount and category are the only required values.
- **Welcome and About:** a three-step setup introduces Kakeibo and lets someone joining mid-month enter their already-spent total. Settings links to a dedicated screen with an original, illustrated Kakeibo overview, category guide, monthly prompts, and a link to the source reading.
- **Monthly ritual:** Start (income, fixed costs, optional savings target), Track, End, and Reflect (chips with an optional note).
- **Insights:** category donut, weekly bars, Wanted vs Needed, and current/previous month totals.
- **History:** date-grouped list with category filters, search, swipe-to-edit/delete on touch screens, undo after delete, Excel/PDF export, and preview-before-import for JSON, Excel, and CSV.
- **Journal:** a searchable, local-only writing space for money reflections or anything else. Saved notes open read-only, with explicit edit/delete actions and a disabled AI placeholder for future work. Select words while writing to apply a soft highlight; dates, moods, tags, and optional prompts are available. On mobile, the list, reader, and editor are separate views. Journal entries travel with JSON backups and device sync.
- **Settings:** editable categories, income and fixed costs, optional savings target, ETB by default, month start day, theme, language, local backup/restore, device sync, the Kakeibo guide, and a demo-data toggle.
- **Audit log:** searchable, on-device record of expense, plan, reflection, journal, and settings changes. Journal text itself is kept out of journal audit details.

Kakeibo uses IndexedDB through Dexie as its local source of truth. Capacitor's Filesystem and Share plugins handle native file sharing; Electron uses a narrow preload bridge and the native Save dialog; web uses the browser share sheet when available and otherwise downloads a file. Nothing is uploaded automatically. A branded skeleton is used while local data initializes, and the same supplied mark is used in the native splash and app icons.
The supplied transparent PNG is retained at `public/kakeibo.png` and used for the app branding. `public/kakeibo.svg` embeds that PNG so the original pixels and transparent edges remain unchanged.

## Requirements

- Node.js and npm
- Android: Android Studio / SDK and a JDK supported by the Android Gradle plugin. Set `ANDROID_HOME`.
- iOS: macOS, Xcode, and CocoaPods. The iOS Capacitor platform must be added on a Mac.
- Desktop: supported Electron host platform. Packaging Windows, Linux, and macOS installers is easiest on the matching OS.

## Install and run

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. First launch offers a short three-step setup; income and fixed costs can be left at zero and the savings target is optional.

```bash
npm run typecheck
npm test
npm run lint
npm run build
npm run preview
```

The demo data switch is in **Settings → Trying things out?**. Turning it on seeds six recent sample expenses and a sample monthly plan. Turning it off removes only entries marked as demo.

## Android and iOS (Capacitor)

Replyline's Capacitor layout and build/sync pattern are reused. Build the web assets before syncing them into the native wrapper:

```bash
npm run build:mobile       # build web app, then cap sync android
npm run cap:sync           # sync configured native platforms
npm run cap:run:android    # build, sync, then run on a connected Android device/emulator
npm run cap:run:android -- --target emulator-5554  # select a specific emulator when needed
npm run android:assemble   # assemble a debug APK
npm run android:install    # build/sync and install to a connected device
npm run android:release    # assemble a locally signed release APK
npm run android:open       # open the Android Studio project
```

`npm run cap:run:ios` builds and runs on iOS after the platform has been added on macOS:

```bash
npx cap add ios            # once, on a Mac
npm run cap:run:ios
npx cap open ios
```

The `android/` project is included. As in Replyline, the iOS Xcode project is not checked in because it can only be generated and built with Apple's tooling.
The Camera plugin needs `NSCameraUsageDescription` and `NSPhotoLibraryUsageDescription` text in the generated iOS app's `Info.plist`; add these on the Mac after `npx cap add ios` and before using QR scanning. iOS direct QR sync also needs a local-network usage description and an App Transport Security policy that permits the app's local HTTP transfer. This configuration is not generated or validated on Linux; the JSON file sync remains available if local HTTP is not enabled.

## Desktop (Electron)

The desktop app wraps the same built web interface; IndexedDB remains local to the Electron profile.

```bash
npm run electron            # Vite + Electron with hot reload
npm run desktop:dev         # alias for electron
npm run desktop:build       # package for the current host platform
npm run desktop:build:win   # Windows NSIS installer
npm run desktop:build:linux # Linux AppImage and .deb
npm run desktop:build:mac   # macOS dmg (run on macOS)
```

Press **N** on desktop to start a new expense. Installer output is written to `release/`.
The package metadata uses `https://example.com/kakeibo` as a placeholder homepage; replace it in `package.json` before distributing public installers.

## Data, import, and export

- All budgeting data is held in local IndexedDB. It remains usable offline, without registration.
- **Excel export** writes a monthly choices sheet, including optional note, from, to, and people details. **PDF export** creates a monthly summary with plan, category totals, and recent choices.
- Excel and CSV imports require `Amount` and `Category` headers. `Date`, `Pause`, `Note`, `From`, `To`, and `People` are optional. JSON imports accept an array, an `{ "expenses": [...] }` object, or a Kakeibo backup. The app validates amounts and dates, preserves optional details, skips exact duplicates, and shows a preview before anything is added. A reusable sample dataset lives at `sample-data/expenses.seed.json`; choose it from **History → Import**.
- **Settings → Backup data** writes a JSON backup; **Restore backup** asks for confirmation before replacing local data. Restore also accepts an `{ "expenses": [...] }` list or an `expense-seed` file with `transactions` and a salary `period`. Optional top-level `plan` (or `income` / `fixed`), `currency`, and `period.startDay` set income, ETB, and month start. Restore skips Get started when expenses or a plan are present. **History → Import** still adds expenses without replacing the device. Sample: `sample-data/user-salary-restore.json`.
- Native devices open the system share sheet. Electron opens the Save dialog. Browsers share files where supported, otherwise they download.
- Every create, edit, delete, restore, plan, reflection, and settings update adds a timestamped local audit entry. Deleted expenses are soft-deleted, excluded from totals, and can be restored immediately from the undo notice.

## Device-to-device sync

Open **Settings → Your data → Sync devices**. On desktop, choose **Show QR for phone** or **Show QR to receive from phone**; on the phone, select the matching direction and scan the desktop's one-time code. If devices are on different networks, build/share a `.json` sync file on one device and choose it on the other. The file route also works as a manual backup transport.

Every transfer is validated and previewed before merging. Newer edits win, local-only entries are kept, and a safety snapshot supports undo if no data changes after the merge. Sync files are limited to 25 MB. The QR session lasts five minutes and uses direct HTTP over the local Wi-Fi network; there is no cloud relay or end-to-end encryption. Use only a trusted private network, not public or guest Wi-Fi. On phones, allow camera access for live scanning or use the camera-photo fallback.

## Project layout

```text
src/
  app/          Kakeibo screens and interaction shell
  db/           Versioned Dexie schema and local repository/audit writes
  domain/       Pure budget calculations and their tests
  fixtures/     Optional demo data
  services/     File sharing, QR scanning, and validated sync
  styles/       Responsive, light/dark neumorphic + glass design
desktop/        Electron main process, preload, and Vite launcher
android/        Capacitor Android project
```

## Replyline patterns reused

Kakeibo keeps Replyline's Vite + React + TypeScript build, Plus Jakarta Sans and Lucide tooling, Dexie/IndexedDB offline-first structure, Capacitor Android/iOS dependencies and `build → cap sync` workflow, Electron main/preload isolation, and platform-specific file handoff pattern. It also follows Replyline's versioned local schema, repository boundary, searchable audit trail, grouped settings, and responsive mobile/desktop shell. As in Replyline, the Amharic option localizes the mobile tab labels; the rest of the interface is English. The tracker domain and Replyline branding are not included in the Kakeibo product UI.
The desktop-hosted QR transfer follows Replyline's local-network handoff pattern but uses short-lived tokens and Kakeibo's reviewable per-record merge. No Replyline data or branding is included.
