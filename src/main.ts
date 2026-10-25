import "./style.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getActive, getTabs, nextTab, closeTab, newTab } from "./tabs";
import { initRecents, openFile, saveActive, saveAs } from "./files";
import {
  renderAll,
  createNewTab,
  closeMenus,
  initWindowControls,
  initMenus,
  toast,
  dbg,
} from "./ui";

function closeActiveTab(): void {
  const active = getActive();
  if (!active) return;
  const stillOpen = closeTab(active.id);
  if (!stillOpen) {
    getCurrentWindow().close();
    return;
  }
  renderAll();
}

function initShortcuts(): void {
  window.addEventListener("keydown", (e) => {
    if (!e.ctrlKey || e.altKey) return;
    const key = e.key.toLowerCase();
    switch (key) {
      case "t":
        e.preventDefault();
        createNewTab();
        break;
      case "w":
        e.preventDefault();
        closeActiveTab();
        break;
      case "o":
        e.preventDefault();
        void openFile();
        break;
      case "s":
        e.preventDefault();
        if (e.shiftKey) void saveAs();
        else void saveActive();
        break;
      case "tab": {
        e.preventDefault();
        const active = getActive();
        if (!active || getTabs().length < 2) return;
        const tab = nextTab(active.id, e.shiftKey ? -1 : 1);
        if (tab) renderAll();
        break;
      }
    }
  });
}

async function boot(): Promise<void> {
  dbg("boot: start");
  initWindowControls();
  dbg("boot: window controls ok");
  initMenus();
  dbg("boot: menus ok");
  initShortcuts();
  await initRecents();
  dbg("boot: recents ok");
  newTab();
  renderAll();
  dbg("boot: done");
  window.addEventListener("beforeunload", () => closeMenus());
  window.addEventListener("error", (e) => {
    toast(`JS error: ${e.message}`);
    dbg(`JS error: ${e.message} at ${e.filename}:${e.lineno}`);
  });
}

boot().catch((e) => {
  toast(`Startup error: ${e}`);
  dbg(`boot failed: ${e}`);
});
