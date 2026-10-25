import { open as dialogOpen, save as dialogSave } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getActive, newTab, setTabLabel, setTabPath, setTabReadOnly } from "./tabs";
import { renderAll, toast, dbg } from "./ui";

export const RECENTS_MAX = 10;

let recents: string[] = [];

const FILE_FILTERS = [
  { name: "Text Files", extensions: ["txt"] },
  { name: "Word Documents", extensions: ["docx", "doc"] },
  { name: "PDF Documents", extensions: ["pdf"] },
  { name: "All Files", extensions: ["*"] },
];

const SAVE_FILTERS = [{ name: "Text Files", extensions: ["txt"] }];

function readCommandFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "docx") return "read_docx";
  if (ext === "doc") return "read_doc";
  if (ext === "pdf") return "read_pdf";
  return "read_file";
}

export async function initRecents(): Promise<void> {
  try {
    recents = await invoke<string[]>("load_recents");
  } catch {
    recents = [];
  }
}

export function getRecents(): string[] {
  return recents;
}

export function addRecent(path: string): void {
  recents = [path, ...recents.filter((p) => p !== path)].slice(0, RECENTS_MAX);
  invoke("save_recents", { recents }).catch(() => {});
}

export function clearRecents(): void {
  recents = [];
  invoke("save_recents", { recents }).catch(() => {});
}

export function editorValue(): string {
  return (document.getElementById("editor") as HTMLTextAreaElement).value;
}

export async function openFile(): Promise<void> {
  let picked: string | string[] | null;
  try {
    dbg("open: invoking dialog");
    picked = await dialogOpen({
      multiple: false,
      filters: FILE_FILTERS,
      title: "Open",
    });
  } catch (e) {
    dbg(`open: dialog error: ${e}`);
    toast(`Open dialog failed: ${e}`);
    return;
  }
  if (!picked) {
    dbg("open: cancelled");
    return;
  }
  const path = typeof picked === "string" ? picked : picked[0];
  if (!path) return;
  dbg(`open: picked ${path}`);
  await openPath(path);
}

export async function openPath(path: string): Promise<void> {
  const cmd = readCommandFor(path);
  try {
    dbg(`open: reading ${path} via ${cmd}`);
    const text = await invoke<string>(cmd, { path });
    newTab(path, text);
    renderAll();
    addRecent(path);
    dbg(`open: loaded ${path} (${text.length} chars, ${cmd})`);
    if (cmd !== "read_file" && text.length === 0) {
      toast("File opened but no text was found");
    }
  } catch (e) {
    dbg(`open: failed for ${path} (${cmd}): ${e}`);
    toast(`Cannot open: ${e}`);
  }
}

export async function saveActive(): Promise<void> {
  const tab = getActive();
  if (!tab) return;
  if (tab.readOnly) {
    toast("Read-only file — use Save As to export as .txt");
    return;
  }
  if (tab.path) {
    await writeToFile(tab.path);
  } else {
    await saveAs();
  }
}

export async function saveAs(): Promise<void> {
  const tab = getActive();
  if (!tab) return;
  let base = tab.path ? tab.path : `${tab.label}.txt`;
  if (tab.readOnly) {
    const dot = base.lastIndexOf(".");
    base = (dot > 0 ? base.slice(0, dot) : base) + ".txt";
  }
  const picked = await dialogSave({
    filters: SAVE_FILTERS,
    title: tab.path ? "Save" : "Save As",
    defaultPath: base,
  });
  if (!picked) return;
  if (picked !== tab.path) {
    setTabPath(tab, picked);
    setTabLabel(tab, picked.split(/[\\/]/).pop() || picked);
    addRecent(picked);
  }
  if (tab.readOnly) {
    const ext = picked.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "txt") setTabReadOnly(tab, false);
  }
  await writeToFile(picked);
  renderAll();
}

async function writeToFile(path: string): Promise<void> {
  const tab = getActive();
  if (!tab) return;
  try {
    tab.text = editorValue();
    await invoke("write_file", { path, content: tab.text });
    dbg(`save: wrote ${path} (${tab.text.length} chars)`);
    toast("Saved");
  } catch (e) {
    dbg(`save: failed for ${path}: ${e}`);
    toast(`Cannot save: ${e}`);
  }
}
