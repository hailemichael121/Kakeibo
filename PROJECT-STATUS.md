# Kakeibo project status

**Last updated:** 2026-11-04  
**Project root:** `/home/yihun/Desktop/Kakeibo`  
**State:** Core web, Android build, and Linux desktop packaging are implemented and verified. Device-to-device sync is implemented; physical camera/network testing remains platform-dependent.

## Implemented

- Responsive React/TypeScript application with offline-first Dexie/IndexedDB storage, mobile glass tabs, desktop sidebar, keyboard `N` shortcut, light/dark themes, and reduced-motion-friendly UI transitions.
- Welcome/setup flow of at most three steps, with Kakeibo history and category guidance, optional savings target, and a starting-spend field when setting up after the configured month start.
- Spendable budget calculations, category totals, expense keypad, one-tap pause tags, monthly ritual, insights, history, searchable audit log, backups, Excel/PDF export, and preview-before-import.
- Settings for budget, categories, currency, month boundary, theme, language, demo data, and device sync; its clean About Kakeibo entry opens a dedicated screen with an illustrated guide, monthly practice, reflection prompts, and source link.
- A searchable local-first Journal screen on mobile and desktop, with dated freeform notes, optional mood/tags/prompts, recently-deleted recovery, audit entries, and inclusion in backups and device sync. Saved notes open in a read-only reader with explicit edit/delete controls and a disabled AI placeholder; selection highlighting is stored with note text. Mobile uses separate list, reader, and editor views. Journal writing is not copied into audit details.
- Branded header navigation on mobile and desktop, with decorative Japanese characters removed from the product UI. The selected Amharic navigation option remains available as a language setting.
- Compact mobile header with the Kakeibo logo/name and “A little more mindful” subtitle, time-of-day home greeting, and a two-column Settings data-action grid without a duplicate header add button.
- Five responsive mobile navigation tabs with the new Journal destination; the add-expense action is a separate floating button above the tab bar. Onboarding amount, spendable summary, and action buttons now wrap within narrow screens.
- Custom header calendar for the active budget period. Each date shows daily expense totals, amount-level color tint, and selecting a date reveals that day's expense rows. Calendar ranges honor the configured 1st/15th budget start.
- Chevron back controls for onboarding steps, sync, QR scanning, and import review.
- Settings keeps a concise About entry; its illustrated guide opens on a separate screen. Sync direction and file actions are paired side by side, with a full-width scan action and a non-overflowing title/icon row.
- Round, fixed-size hover/focus targets for calendar arrows and close buttons; back-button chevrons have their own fitted circular hover target.
- Four user-supplied Kakeibo WebP illustrations are stored locally for the About guide, so the article works offline. The supplied PocketSmith article text is summarized in original wording and linked as further reading instead of reproduced.
- Direct desktop/mobile QR sync with five-minute token expiry, 25 MB size limit, preview-before-merge, per-record newer-wins behavior, local-only record retention, and guarded undo via a saved sync snapshot. JSON file transfer is also supported.
- Supplied PNG retained byte-for-byte at `public/kakeibo.png`; the SVG file embeds that PNG to preserve its exact pixels and transparency. Browser icon, Electron icon, Android launcher/status icons, native splash images, top navigation, and branded loading skeleton use the Kakeibo mark. The SVG is a raster-in-SVG wrapper, not a path-traced vector.
- Capacitor Android project and Electron desktop app, with commands documented in `README.md`.

## Validation completed

- `npm run typecheck` passes.
- Targeted ESLint passes for the journal, database, sync, and app files changed here. Full `npm run lint` currently reports three existing errors in `src/lib/widget.ts` (`no-explicit-any` twice and an unused catch variable); that unrelated widget code was left untouched.
- `npm test` passes: 31 tests across budgets, calendar ranges/daily totals, amount parsing, sync validation/merge/undo, journal persistence/audit behavior, QR scanning, and LAN-link validation.
- `npm run test:lan` passes: 3 desktop LAN transfer server tests.
- `npm run build` passes.
- `npm run cap:sync` and `npm run build:mobile && npm run android:assemble` pass; Gradle reports `BUILD SUCCESSFUL`.
- `npm run electron` serves the UI and starts Electron; the Vite endpoint returned HTTP 200. The test process was stopped cleanly. The host emitted non-blocking GTK font and VA-API warnings.
- `npm run desktop:build:linux` completes and creates the Linux AppImage and `.deb` packages in `release/`.
- Browser check confirmed the welcome step, mid-month starting-spend field, optional savings step, home screen, device-sync screen, mobile logo/header, and calendar day selection/details. The supplied PNG matches the read-only source attachment byte-for-byte.
- Browser checks at 320, 360, 390, and 400px verified onboarding step 3 buttons and the monthly spendable summary stay within the card. Home, Insights, History, Journal, Settings, Sync, Audit, About, and Ritual also showed no horizontal overflow at 320px; the five mobile tabs fit and the expense action floats above them without overlap.
- Android plugins are synced and the APK builds, but no Android device/emulator was attached, so live camera scanning and device-to-device radio/network transfer could not be exercised here.
- iOS dependencies/configuration are present, but the Xcode project, privacy strings, local-network/ATS policy, and runtime validation still require macOS/Xcode. See the iOS setup notes in the README; JSON file sync is available without direct local HTTP.

## Sync and network limitations

- QR transfer is direct over private Wi-Fi using HTTP, not end-to-end encrypted. The app warns users to use a trusted network; the transfer has a short-lived token and no cloud relay. Do not use public or guest Wi-Fi.
- Android allows cleartext traffic for the QR path. iOS local HTTP and camera settings need to be added to the generated Xcode app's `Info.plist`; use the sync-file route if local HTTP is not enabled.
- The SVG intentionally references `kakeibo.png` so the supplied artwork stays unchanged. Keep both files together in `public/`.

## Dependencies and known follow-ups

- `npm audit --omit=dev` reports 9 moderate production advisories in ExcelJS 4.4.0 and transitive archive/glob dependencies; it reports no high or critical advisories. npm proposes a major ExcelJS downgrade, which was not applied because Excel workbook import/export is required.
- `package.json` still uses `https://example.com/kakeibo` as a placeholder homepage; replace it before public distribution.
- Before platform release: run/install Android on a connected device; generate the iOS project on macOS, add and verify the required camera/photo privacy strings, choose a local-network policy, then build and test QR scanning/sync in Xcode.

## Reused from Replyline

- Vite + React + TypeScript, Plus Jakarta Sans, Lucide, ESLint, and Vitest patterns.
- Dexie/IndexedDB offline-first structure, versioned schema/repository boundary, searchable local audit log, and grouped settings.
- Capacitor project/build/sync workflow and Electron main/preload isolation.
- Browser/native/desktop file handoff and the desktop-hosted private-LAN QR transfer pattern, adapted to Kakeibo data and previewable per-record merges.
