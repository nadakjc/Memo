# PRD — Memo (Win11 Notepad clone) · v1

## 1. Goal
A Windows desktop memo app that behaves and looks like Windows 11 Notepad, built with Tauri 2 (Rust backend + HTML/CSS/JS webview). Core focus: **multi-tab document management** + native file operations.

## 2. Target user & platform
- Windows 11 desktop (Win10 fallback: solid background instead of Mica)
- Single-window app: every file opens as a **tab in the same window** (no multi-window in v1)

## 3. Tech stack
| Layer | Choice |
|---|---|
| Shell | Tauri 2.x (Rust) |
| Frontend | Vite + vanilla TypeScript (no framework) |
| Styling | Hand-rolled CSS, WinUI 3 / Fluent look, Segoe UI Variable + Consolas |
| Native dialogs | `tauri-plugin-dialog` (open / save) |
| File IO | Custom Rust commands (`read_text` / `write_text`) — a text editor's job |
| Recent files | JSON file in app config dir via Rust command |
| Packaging | Tauri NSIS installer |

## 4. Feature spec

### 4.1 Tab system (core, from Win11 Notepad)
| Behavior | Spec |
|---|---|
| New tab | `Ctrl+T` or `+` button at tab-bar end. First launch opens one empty "Untitled 1" tab |
| Switch | Click tab; `Ctrl+Tab` cycles; instant content swap |
| Close | `X` on tab (visible on hover/active), `Ctrl+W`, middle-click on tab. Closing the **last tab exits the app** (same as Win11 Notepad) |
| Tab label | Filename, or "Untitled N"; active tab has accent underline + tinted background |
| Tab bar | Fluent pill tabs, horizontal scroll when crowded, `+` button trailing |
| Deferred (v1.x) | Drag-to-reorder, dirty-dot + save prompt, session restore |

### 4.2 File operations
- **Open** (`Ctrl+O`): native file dialog → content loads into a **new tab** (same file opened twice = two tabs)
- **Save** (`Ctrl+S`): writes if tab has a path; otherwise falls back to Save As
- **Save As** (`Ctrl+Shift+S`): native save dialog → sets tab path & label
- **Recent files**: last 10 in the File menu; click opens in a new tab
- v1 constraints: UTF-8 only; line endings preserved as read; closing a tab with unsaved changes is **silent** (no prompt) — prompt is the first v1.x follow-up

### 4.3 Editor surface (minimal)
- Plain textarea-based editor, Consolas 11pt, word wrap on by default
- Native clipboard + undo for free; no syntax highlighting in v1

### 4.4 UI / look (very close to Win11)
- `decorations: false` + **custom title bar**: app icon + "Memo" left, **File menu**, **Edit menu**, **View menu** buttons, min/max/close window controls right (Tauri window controls API)
- **Mica** backdrop (Tauri `windowEffects: ["mica"]`), solid fallback on Win10
- Fluent menus:
  - File: New Tab, Open…, Save, Save As…, Recent (submenu), Exit
  - Edit: Undo, Redo, Cut, Copy, Paste, Select All
  - View: Word Wrap (checkable)
- Accent color: #005FB8 (Win11 default), light + dark theme via `prefers-color-scheme`

## 5. Non-goals (v1)
Dirty tracking/prompts, tab reorder, restore-on-restart, encoding picker, search/replace, multi-window, plugins, mobile.

## 6. Milestones
1. **PRD sign-off** → `PRD.md`
2. **Scaffold**: Tauri 2 + Vite TS app; dialog plugin; window config (undecorated, Mica, icon)
3. **UI shell**: title bar + window controls + menus + tab bar + editor pane (Fluent CSS)
4. **Tab engine**: tabs[], activeTab, open/close/switch, shortcuts, middle-click
5. **File ops**: dialog → Rust read/write; recent files; Save / Save As logic
6. **Polish + verify**: `tauri dev` manual checklist, `tauri build` installer

## 7. Acceptance checklist
- [ ] `Ctrl+T` opens new tab; first run shows "Untitled 1"
- [ ] Switch/close via click, `Ctrl+W`, middle-click; last close exits app
- [ ] Open a file → correct content in new tab; Save / Save As persist to disk
- [ ] File menu recent list updates after opens (max 10)
- [ ] Mica backdrop + Segoe UI; title bar min/max/close work
- [ ] Edit menu actions work on the focused textarea; View toggles word wrap
- [ ] Builds to NSIS installer via `npm run tauri build`

## 8. Risks / notes
- WebView2 required (preinstalled on Win11)
- Mica applies when window focused; fallback color otherwise
- textarea performance degrades on multi-MB files (accepted, out of scope)
- Rust toolchain + VS Build Tools (MSVC) required to compile — installed on dev machine
