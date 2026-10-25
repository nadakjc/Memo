import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition, getCurrentWindow } from "@tauri-apps/api/window";
import {
  getTabs,
  getActive,
  activateTab,
  closeTab,
  newTab,
} from "./tabs";
import {
  openFile,
  saveActive,
  saveAs,
  openPath,
  getRecents,
} from "./files";

let wordWrap = true;

export function dbg(line: string): void {
  invoke("debug_log", { line }).catch((e) => console.error("dbg failed", e));
}

const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

function editorEl(): HTMLTextAreaElement {
  return $("editor");
}

let editorTabId: number | null = null;

export function renderAll(): void {
  syncEditorIn();
  const active = getActive();
  if (active) {
    editorEl().value = active.text;
  } else {
    editorEl().value = "";
  }
  editorEl().readOnly = active?.readOnly ?? false;
  editorTabId = active ? active.id : null;
  renderTabs();
  renderDocTitle();
  editorEl().focus();
}

function syncEditorIn(): void {
  if (editorTabId === null) return;
  const tab = getTabs().find((t) => t.id === editorTabId);
  if (tab) tab.text = editorEl().value;
}

function renderDocTitle(): void {
  const active = getActive();
  $("doc-title").textContent = active?.path
    ? ` — ${active.label}${active.readOnly ? " (read-only)" : ""}`
    : "";
}

function renderTabs(): void {
  const wrap = $("tabs");
  wrap.innerHTML = "";
  const activeId = getActive()?.id ?? null;
  for (const tab of getTabs()) {
    const el = document.createElement("button");
    el.type = "button";
    el.className = `tab${tab.id === activeId ? " active" : ""}`;
    el.dataset.id = String(tab.id);
    el.title = tab.path ?? tab.label;

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = tab.label;

    const x = document.createElement("span");
    x.className = "tab-x";
    x.setAttribute("aria-label", "Close tab");
    x.innerHTML =
      '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0L10 10M10 0L0 10" stroke="currentColor" stroke-width="1.1"/></svg>';
    x.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      closeTabId(tab.id);
    });
    x.addEventListener("click", (e) => e.stopPropagation());

    el.appendChild(label);
    el.appendChild(x);
    el.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTabId(tab.id);
        return;
      }
      if (e.button === 0 && tab.id !== activeId) {
        activateTab(tab.id);
        renderAll();
      }
    });
    wrap.appendChild(el);
  }
}

function closeTabId(id: number): void {
  const stillOpen = closeTab(id);
  if (!stillOpen) {
    getCurrentWindow().close();
    return;
  }
  renderAll();
}

export function createNewTab(): void {
  newTab();
  renderAll();
  editorEl().focus();
}

// ---------------------------------------------------------------- window

export function initWindowControls(): void {
  const win = getCurrentWindow();

  $("btn-min").addEventListener("click", () => win.minimize());
  $("btn-max").addEventListener("click", () =>
    win.isMaximized().then((m) => (m ? win.unmaximize() : win.maximize())),
  );
  $("btn-close").addEventListener("click", () => win.close());

  const ICON_MAX =
    '<svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" stroke="currentColor" stroke-width="1" fill="none"/></svg>';
  const ICON_RESTORE =
    '<svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 2.5V1a.5.5 0 0 1 .5-.5H9a.5.5 0 0 1 .5.5V7a.5.5 0 0 1-.5.5H8" fill="none" stroke="currentColor" stroke-width="1"/><rect x="0.5" y="2.5" width="7" height="7" stroke="currentColor" stroke-width="1" fill="none"/></svg>';
  const refreshMaxIcon = () =>
    win.isMaximized().then((m) => {
      const btn = $("btn-max");
      btn.classList.toggle("is-max", m);
      btn.innerHTML = m ? ICON_RESTORE : ICON_MAX;
    });
  win.onResized(refreshMaxIcon).catch(() => {});
  refreshMaxIcon().catch(() => {});

  $("titlebar").addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    if ($("window-controls").contains(e.target as Node)) return;
    e.preventDefault();
    void win
      .isMaximized()
      .then((maxed) => {
        if (maxed) return;
        return win.outerPosition();
      })
      .then((pos) => {
        if (!pos) return;
        const startX = e.screenX;
        const startY = e.screenY;
        const originX = pos.x;
        const originY = pos.y;
        const onMove = (ev: MouseEvent) => {
          void win.setPosition(
            new LogicalPosition(
              Math.round(originX + (ev.screenX - startX)),
              Math.round(originY + (ev.screenY - startY))
            )
          );
        };
        const onUp = () => {
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      })
      .catch(() => {});
  });

  $("titlebar").addEventListener("dblclick", (e) => {
    if ($("window-controls").contains(e.target as Node)) return;
    win.toggleMaximize().catch(() => {});
  });
}

// ---------------------------------------------------------------- menus

interface Item {
  type?: "item";
  label?: string;
  shortcut?: string;
  checked?: boolean;
  disabled?: boolean;
  sep?: boolean;
  header?: string;
  action?: () => void;
}

function editorCommand(cmd: "undo" | "redo" | "cut" | "copy"): boolean {
  editorEl().focus();
  return document.execCommand(cmd);
}

async function editorPaste(): Promise<void> {
  editorEl().focus();
  if (document.execCommand("paste")) return;
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;
    const el = editorEl();
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.setRangeText(text, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } catch {
    toast("Paste failed");
  }
}

function fileMenu(): Item[] {
  const active = getActive();
  const items: Item[] = [
    { label: "New Tab", shortcut: "Ctrl+T", action: createNewTab },
    { label: "Open…", shortcut: "Ctrl+O", action: () => openFile() },
    { sep: true },
    {
      label: "Save",
      shortcut: "Ctrl+S",
      action: () => saveActive(),
      disabled: active?.readOnly ?? false,
    },
    {
      label: "Save As…",
      shortcut: "Ctrl+Shift+S",
      action: () => saveAs(),
    },
    { sep: true },
    { header: "Recent" },
  ];
  const recents = getRecents();
  if (recents.length === 0) {
    items.push({ label: "(empty)", disabled: true });
  } else {
    for (const path of recents) {
      const name = path.split(/[\\/]/).pop() ?? path;
      items.push({
        label: name,
        action: () => openPath(path),
      });
    }
  }
  items.push({ sep: true });
  items.push({
    label: "Exit",
    action: () => getCurrentWindow().close(),
  });
  return items;
}

function editMenu(): Item[] {
  return [
    { label: "Undo", shortcut: "Ctrl+Z", action: () => editorCommand("undo") },
    { label: "Redo", shortcut: "Ctrl+Y", action: () => editorCommand("redo") },
    { sep: true },
    { label: "Cut", shortcut: "Ctrl+X", action: () => editorCommand("cut") },
    {
      label: "Copy",
      shortcut: "Ctrl+C",
      action: () => editorCommand("copy"),
    },
    { label: "Paste", shortcut: "Ctrl+V", action: () => void editorPaste() },
    { sep: true },
    {
      label: "Select All",
      shortcut: "Ctrl+A",
      action: () => {
        const el = editorEl();
        el.focus();
        el.select();
      },
    },
  ];
}

function viewMenu(): Item[] {
  return [
    {
      label: "Word Wrap",
      checked: wordWrap,
      action: () => {
        wordWrap = !wordWrap;
        const el = editorEl();
        el.setAttribute("wrap", wordWrap ? "soft" : "hard");
        el.classList.toggle("no-wrap", !wordWrap);
      },
    },
  ];
}

let openMenuName: string | null = null;

export function closeMenus(): void {
  dbg(`menu: closeMenus (was ${openMenuName})`);
  $("menu-popups").innerHTML = "";
  openMenuName = null;
  document.querySelectorAll(".menu-btn.open").forEach((b) => b.classList.remove("open"));
}

function showMenu(name: "file" | "edit" | "view", anchor: HTMLElement): void {
  const items: Item[] =
    name === "file" ? fileMenu() : name === "edit" ? editMenu() : viewMenu();

  const popup = document.createElement("div");
  popup.className = "popup";

  for (const it of items) {
    if (it.sep) {
      const s = document.createElement("div");
      s.className = "popup-sep";
      popup.appendChild(s);
      continue;
    }
    if (it.header) {
      const h = document.createElement("div");
      h.className = "popup-header";
      h.textContent = it.header;
      popup.appendChild(h);
      continue;
    }
    const row = document.createElement("button");
    row.type = "button";
    row.className = "popup-item" + (it.disabled ? " disabled" : "");
    if (it.checked) row.classList.add("checked");

    const check = document.createElement("span");
    check.className = "popup-check";
    check.textContent = it.checked ? "✓" : "";

    const label = document.createElement("span");
    label.className = "popup-label";
    label.textContent = it.label ?? "";

    let shortcut: HTMLElement | null = null;
    if (it.shortcut) {
      shortcut = document.createElement("span");
      shortcut.className = "popup-shortcut";
      shortcut.textContent = it.shortcut;
    }

    row.appendChild(check);
    row.appendChild(label);
    if (shortcut) row.appendChild(shortcut);

    if (it.action && !it.disabled) {
      row.addEventListener("click", () => {
        dbg(`menu: item "${it.label ?? "?"}" (action)`);
        closeMenus();
        it.action!();
      });
    }
    popup.appendChild(row);
  }

  const host = $("menu-popups");
  host.innerHTML = "";
  host.appendChild(popup);
  host.classList.remove("hidden");
  anchor.classList.add("open");
  openMenuName = name;

  const r = anchor.getBoundingClientRect();
  const pw = popup.offsetWidth;
  const ph = popup.offsetHeight;
  // Absolute document coordinates (host is position:absolute at doc origin;
  // document never scrolls, so viewport + scrollOffset == document). This
  // avoids the stale fixed-viewport bug that offset popups below the window.
  let left = r.left + window.scrollX;
  if (left + pw > window.innerWidth - 8) {
    left = window.innerWidth - pw - 8;
  }
  let top = r.bottom + 4 + window.scrollY;
  if (top + ph > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - ph - 8);
  }
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
  const pr = popup.getBoundingClientRect();
  const hcs = getComputedStyle(host);
  dbg(
    `menu: show ${name} at ${left},${top} popupRect=${pr.width}x${pr.height} hostDisplay=${hcs.display} hostZ=${hcs.zIndex} hostPos=${hcs.position}`
  );
}

export function initMenus(): void {
  let suppressNextShow = false;
  const buttons = document.querySelectorAll<HTMLButtonElement>(".menu-btn");
  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      dbg(`menu: click on ${btn.dataset.menu} (open=${openMenuName}, suppress=${suppressNextShow})`);
      if (suppressNextShow) {
        suppressNextShow = false;
        return;
      }
      const name = btn.dataset.menu as "file" | "edit" | "view";
      if (openMenuName === name) {
        closeMenus();
      } else {
        closeMenus();
        showMenu(name, btn);
      }
    });
  });

  document.addEventListener("mousedown", (e) => {
    if (openMenuName && !$("menu-popups").contains(e.target as Node)) {
      suppressNextShow = false;
      if (e.target instanceof Element) {
        const btn = e.target.closest(".menu-btn") as HTMLButtonElement | null;
        if (btn) suppressNextShow = btn.dataset.menu === openMenuName;
      }
      dbg(`menu: mousedown outside (target=${(e.target as Element).id || (e.target as Element).tagName}) -> close ${openMenuName}`);
      closeMenus();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenus();
  });
}

// ---------------------------------------------------------------- toast

let toastTimer: number | undefined;

export function toast(msg: string): void {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  el.style.left = `${window.innerWidth - w - 16 + window.scrollX}px`;
  el.style.top = `${window.innerHeight - h - 16 + window.scrollY}px`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.add("hidden"), 2200);
}
