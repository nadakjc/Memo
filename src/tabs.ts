export interface Tab {
  id: number;
  path: string | null;
  text: string;
  label: string;
  readOnly: boolean;
}

export const READONLY_EXTS = ["docx", "doc", "pdf"];

export function pathReadOnly(path: string | null): boolean {
  if (!path) return false;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return READONLY_EXTS.includes(ext);
}

let nextId = 1;
let untitledCounter = 1;

const state = {
  tabs: [] as Tab[],
  activeId: null as number | null,
};

export function getTabs(): Tab[] {
  return state.tabs;
}

export function getActive(): Tab | null {
  return state.tabs.find((t) => t.id === state.activeId) ?? null;
}

export function newTab(path: string | null = null, text = "", readOnly?: boolean): Tab {
  const id = nextId++;
  let label: string;
  if (path) {
    label = decodeURIComponent(path.split(/[\\/]/).pop() || path);
  } else {
    label = `Untitled ${untitledCounter++}`;
  }
  const tab: Tab = {
    id,
    path,
    text,
    label,
    readOnly: readOnly ?? pathReadOnly(path),
  };
  state.tabs.push(tab);
  state.activeId = id;
  return tab;
}

export function activateTab(id: number): Tab | null {
  const tab = state.tabs.find((t) => t.id === id);
  if (!tab) return null;
  state.activeId = id;
  return tab;
}

export function nextTab(fromId: number, dir: 1 | -1 = 1): Tab | null {
  const n = state.tabs.length;
  if (n === 0) return null;
  const idx = state.tabs.findIndex((t) => t.id === fromId);
  const next = state.tabs[(idx + dir + n) % n];
  state.activeId = next.id;
  return next;
}

export function closeTab(id: number): boolean {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  state.tabs.splice(idx, 1);
  if (state.activeId === id) {
    if (state.tabs.length === 0) {
      state.activeId = null;
    } else {
      const nextIdx = Math.min(idx, state.tabs.length - 1);
      state.activeId = state.tabs[nextIdx].id;
    }
  }
  return state.tabs.length > 0;
}

export function setTabLabel(tab: Tab, label: string): void {
  tab.label = label;
}

export function setTabPath(tab: Tab, path: string): void {
  tab.path = path;
}

export function setTabReadOnly(tab: Tab, readOnly: boolean): void {
  tab.readOnly = readOnly;
}
