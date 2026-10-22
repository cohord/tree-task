# Tree Task 3.0 — Tree, Gantt, Calendar + Offline-first OneDrive sync

**Everything is one task tree.** The same tasks appear in Tree, Gantt and Calendar views. This release extends the existing offline-first OneDrive prototype with native date planning; it does not create a separate project/task type. No database, paid backend, server-side credentials or subscription needed. It stores a single JSON file in your OneDrive application's folder (`Apps/Tree Task/tree-task.json`, exact folder name follows the Microsoft Entra app name).

## New in 3.1 — Notes

- Each task has its own plain-text notes (up to 20,000 characters), regardless of nesting level. Click the document icon beside any task, or open its actions (···) → **Add / edit notes**.
- Notes save to the existing offline task tree as you type. Closing the notes editor returns to the tree. One edit session creates a single undo entry.
- Search finds notes as well as titles. A highlighted document icon indicates a task with notes.
- In Gantt or Calendar, open a task's schedule editor, then choose **Open task notes**.
- Notes are included in JSON imports/exports, restore points and OneDrive sync. OneDrive merges the notes field independently; if both devices edit the same notes differently, Tree Task asks you to resolve the conflict instead of silently overwriting either.
- Existing task trees with no notes remain compatible. **Update all devices before editing task notes.** Older versions can remove unknown notes fields when saving or syncing. Export a JSON backup before upgrading.

## New in 3.0 — Planning

- **Tree view:** all existing unlimited nested work breakdown tasks, fast sibling/child entry and reordering.
- **Gantt view:** nested WBS rows aligned to a horizontally scrolling timeline, day/month zoom, previous/today/next navigation, and a filter for **any project/task branch**. Add a scheduled task from the Gantt toolbar; click a task row or bar to set dates. Drag a scheduled bar to move its start/end together or drag its right edge to extend/shorten its end date. Alternative touch-accessible date controls are available by tapping the task name. Task completion dims the bar. Undated parent tasks automatically display an overview bar spanning their scheduled children.
- **Calendar view:** Monday–Sunday monthly grid, multi-day tasks displayed across every included day, choose a date for its task agenda, navigate months, and add a new task under any existing parent. Selecting a task opens the same schedule editor.
- **Single data model:** each task now has optional `startDate` and `endDate` fields, both ISO `YYYY-MM-DD` or `null`. The range is inclusive. Missing start or end dates are treated as a single-day task when saved. Calendar shows only explicitly dated tasks; Gantt can additionally show derived parent summary bars.
- **Offline and cloud:** date changes save locally, are included in JSON backups and recovery copies, undo properly restores them, and OneDrive merges dates as individual fields. Conflicting changes are reviewed instead of blindly overwritten. Invalid combinations (e.g. merged end before start) are blocked.
- **Compatibility:** older local tasks and OneDrive JSON without date fields load as unscheduled tasks. Existing `tree-task.v1` local storage and the OneDrive `tree-task.json` location remain the same. **Upgrade Tree Task on both devices before creating schedule data:** older v2 browser clients cannot recognise the date fields and could erase them on re-save.

**Not included yet:** task dependencies / predecessor arrows, automatic critical path, resource assignment, native Outlook/Apple calendar subscriptions, and background sync when the app is closed. These are potential future enhancements, not features of this version.

## What is implemented

- Unlimited nested parent, child and sibling tasks, reordering, completion, undo, search, import/export and dark mobile interface from the original prototype.
- **Local-first:** every edit saves immediately to browser `localStorage` (key: `tree-task.v1`). The app can launch offline after its first successful HTTPS visit and service-worker installation.
- **Microsoft OneDrive:** authorization-code sign-in with OAuth PKCE (no client secret), Microsoft Graph file access with delegated `Files.ReadWrite.AppFolder`, upload/download, auto-sync after edits and on returning online, plus Sync Now.
- **Concurrency:** OneDrive ETag-based conditional PUT with retry when the file has changed. A three-way merge uses the last confirmed cloud snapshot to combine non-conflicting edits, including scheduling. When both devices independently change the tree structure, or edit the same task field differently, the app pauses and asks what to keep. Neither version is replaced silently.
- **Recovery:** download either version before resolving conflicts, automatic local recovery snapshots before cloud replacement/merge and destructive imports/clear (last five, subject to browser storage availability), normal JSON export/import.
- **Account safety:** first connection to an existing cloud tree requires an explicit choice; remote deletion and reconnecting without a known base also require a choice.

## 1. Host this folder for free (required for iPhone and OneDrive login)

Deploy the **contents** of this folder to an HTTPS static site. GitHub Pages is a free option for a public repository; code is public, **your tasks and Microsoft sign-in tokens are not included in the site files**. A static host with HTTPS will also work. Server costs: $0 for free hosting tiers, subject to the provider's limits. 

**To test on Windows:** `python -m http.server 8000`, then open `http://localhost:8000/`. Microsoft accepts localhost as a development redirect if registered. Double-clicking `index.html` will work for local tasks, but **OneDrive login cannot be used from `file://`**.

Do not place real task data, exported JSON backups, or secrets in the publicly hosted repository. Do not create a client secret.

## 2. Create your Microsoft app registration

1. Visit <https://entra.microsoft.com/> → **Identity → Applications → App registrations → New registration** (the exact menu layout may change). Some Microsoft work tenants restrict app registrations; an admin may need to allow it.
2. Name: **Tree Task**.
3. Supported account type: **Accounts in any organizational directory and personal Microsoft accounts** (or the appropriate single-account option). This supports the OneDrive account you plan to use.
4. After registration, copy **Application (client) ID** (a GUID). **You do not need a tenant ID or a client secret.**
5. Under **Authentication**, add platform **Single-page application** (SPA). Add the **exact Tree Task URL** shown in Tree Task → `···` → OneDrive sync, e.g. `https://yourname.github.io/tree-task/`. Also register a localhost URL separately if testing locally, e.g. `http://localhost:8000/`. Don't set it up as a Web platform.
6. Under **API permissions** → **Microsoft Graph** → **Delegated permissions**, add `Files.ReadWrite.AppFolder`. By default, the app requests only this OneDrive file permission plus the standard Microsoft sign-in scopes `openid`, `profile`, `offline_access`. Depending on your tenant, consent may need approval.
7. **Optional fallback if Microsoft returns 403/accessDenied:** Tree Task offers a separate **Try broader OneDrive permission** button. This requests delegated `Files.ReadWrite`, which permits **read/write access to the entire OneDrive**. This is a security trade-off; the app's implementation still accesses only its app folder. Add this Graph delegated permission to your app registration if using the fallback; tenant consent requirements may apply. This was added because of reported Microsoft issues with new personal-account AppFolder consents in Aug–Oct 2026. Do not select unless necessary.
8. In the Tree Task app → `···` → paste the client ID → **Connect Microsoft OneDrive** → accept Microsoft sign-in/consent.

**Important:** the `redirectUri` is computed as your current browser origin + pathname. If you use `/index.html`, `/tree-task/` or another route, that exact path must be registered as a SPA redirect URI. Avoid renaming the site path after setup. The app stores the client ID in browser local storage (it is a *public* identifier, not a secret).

## 3. Use on Windows and iPhone

- Open the **same HTTPS URL** on both devices.
- Choose **the same Microsoft account** on both devices. Each device must sign in at least once. Connect the second device and choose **Use OneDrive version** if you want to download the tree from the first device.
- Changes work without internet and sync on reconnection, when the app becomes active, about once per minute while open, or via **Sync now**. Sync is **not** background push: closing the app prevents further uploads until it is reopened. Wait for **Synced with OneDrive** before switching devices when possible.
- iPhone: open URL in Safari → Share → Add to Home Screen. **Safari and an installed Home Screen web app may not share the same local browser data or sign-in session.** Open the installed app and connect OneDrive there as well if necessary, then explicitly download the OneDrive tree.

## Conflict handling

- If only one device changed the tree, the other downloads those changes automatically.
- If both devices changed different **fields or tasks** and at most one device changed the overall tree structure, the changes merge automatically.
- If both independently add/remove/move tasks, even on different branches, the app conservatively pauses and asks you to choose a version. This is intentional; full automatic structural merge is not included in v2.0.
- When a conflict is shown, you can **download this device backup** and **download OneDrive backup** separately, choose **Use OneDrive**, **Keep this device**, or **Decide later**. The upload rechecks the current OneDrive ETag; if the remote changes before confirmation, the app retries instead of overwriting it.
- Up to five local recovery snapshots are retained. They are **not** a replacement for periodic exported backups or OneDrive version history.

## Security, cost and limits

- No hosting or database charges if you use a free HTTPS static host and storage you already own. You are using your own OneDrive storage quota; this isn't unlimited free storage.
- By default, Microsoft Graph's **App Folder** scope grants access to the app's OneDrive folder, not general OneDrive files. If you explicitly choose the broad permission fallback, Microsoft grants the app much broader OneDrive access. The cloud file is visible to the OneDrive account owner.
- OAuth tokens for the authorised account are kept in the browser's local storage for login continuity. Do not use on an untrusted/shared browser. Disconnect OneDrive in Tree Task when needed. Browser storage or PWA deletion can erase unsynced local edits and tokens.
- Browser-based Microsoft SPA refresh tokens have a limited lifetime and you may need to sign in again periodically; use **Sign in again** in settings when prompted.
- The app is a local-first prototype, **not an externally authenticated production service**. Graph interactions require a real Microsoft account/registered SPA to verify end-to-end. The logic is implemented and local merge tests are provided, but it has not been connected to your personal OneDrive account in this build environment.
- **App-folder uploads** rely on OneDrive ETag conditional writing. If a particular OneDrive tenant/app permission policy rejects this Graph operation, the app leaves changes local and displays the error; it won't silently replace data.

## File layout

- `index.html`: tree UI, task/notes/date editor, calendar and Gantt rendering, plus sync controls.
- `planning.css`: responsive Gantt/calendar styling.
- `planning-core.js`: date-only arithmetic, parent rollup and calendar-day selection, with tests.
- `sync-merge.js`: pure, tested three-way merge and cloud data validation.
- `onedrive-sync.js`: OAuth PKCE, Microsoft Graph app-folder and sync engine.
- `sw.js`, `manifest.webmanifest`, `icon*`: offline and Home Screen installation.
- `test-merge.cjs`, `test-sync.cjs`, `test-planning.cjs`: run locally with `node --test test-*.cjs` (24 passing checks).

## Manual verification after Microsoft sign-in

1. Connect Windows. Add `Test A`; wait for **Synced with OneDrive**. Check your app folder in OneDrive.
2. Sign in on iPhone, select **Use OneDrive** when prompted; confirm `Test A` appears.
3. Put iPhone offline, add `Test B`; bring it online and sync. Reopen Windows and verify both tasks.
4. Edit different tasks on each device offline; sync both. Verify the merge.
5. Change the same task title differently while both offline. Sync one device, then the other. Verify the conflict dialog (and download both backups before choosing).
6. Test a deleted/moved branch conflict and save a JSON backup.

Original tree data key `tree-task.v1` is unchanged, so a browser at the **same URL** keeps its existing local tasks after upgrade. Switching from a `file://` prototype to an HTTPS URL requires a manual JSON export/import once.

## Upgrade checklist for an existing v2 installation

1. **Export a backup** from the old app before deployment.
2. Replace the hosted site's v2 files with this complete v3 folder, preserving its HTTPS URL and Microsoft SPA redirect URI. The service worker cache name is upgraded to `tree-task-v3`, so the new app assets replace the previous version when the browser updates. If a Home Screen app still shows the old interface, close and reopen it; a browser hard refresh can help.
3. **Upgrade both iPhone and Windows before scheduling tasks.** Do not keep an old v2 tab or offline-installed v2 copy editing the same synced OneDrive file.
4. In the app, open **Gantt** or **Calendar**. Use **+ Task** to create and schedule work, or open any existing task's `···` menu → **Schedule / edit dates**.
5. Test on one device, wait for **Synced with OneDrive**, then open the upgraded app on the other device and check that schedules appear.

The standalone `tree-task-v3-preview.html` is provided separately for a quick look at the UI. Deploy the full folder for offline installation and actual OneDrive authentication. Live OneDrive authentication was not possible to verify here without your Microsoft registration and account; the local browser UI and offline/merge logic were tested.
