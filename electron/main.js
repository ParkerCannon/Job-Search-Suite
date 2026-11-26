"use strict";

// Desktop shell for the single-file browser build. There is no server, no port,
// and no profile data in this process: the renderer is dist-portable/index.html.

const { app, BrowserWindow, Menu, dialog, session, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const STATIC_PAGE = path.resolve(__dirname, "..", "dist-portable", "index.html");
const APP_URL = pathToFileURL(STATIC_PAGE).href;
const SMOKE = process.argv.includes("--smoke");

let mainWindow = null;

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function openExternally(url) {
  if (isHttpUrl(url)) void shell.openExternal(url);
}

function fatal(message) {
  dialog.showErrorBox("Job Search Suite", message);
  app.quit();
}

function buildMenu() {
  const view = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "toggleDevTools" },
      { role: "togglefullscreen" },
    ],
  };
  const quit = { label: "Quit", role: "quit" };
  const template =
    process.platform === "darwin"
      ? [{ role: "appMenu", submenu: [{ role: "about" }, { type: "separator" }, quit] }, view]
      : [view, { label: "App", submenu: [quit] }];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function configureDownloads() {
  session.defaultSession.on("will-download", (_event, item) => {
    const target = dialog.showSaveDialogSync({
      title: "Save file",
      defaultPath: item.getFilename() || "job-search-suite-download",
    });
    if (!target) item.cancel();
    else item.setSavePath(target);
  });
}

async function smokeCheck() {
  const script = `(() => {
    let storage = "unavailable";
    try {
      localStorage.setItem("jss-smoke", "ok");
      storage = localStorage.getItem("jss-smoke");
      localStorage.removeItem("jss-smoke");
    } catch (error) { storage = "error:" + error.message; }
    return {
      title: document.title,
      rootChildren: document.getElementById("root")?.children.length ?? 0,
      hasOverview: (document.body.innerText || "").includes("Overview"),
      storage
    };
  })()`;

  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const value = await mainWindow.webContents.executeJavaScript(script);
      if (value.rootChildren > 0 && value.hasOverview) {
        console.log("JSS_SMOKE=" + JSON.stringify(value));
        app.quit();
        return;
      }
    } catch (error) {
      console.log("JSS_SMOKE_ERROR=" + String(error));
      app.quit();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  console.log("JSS_SMOKE=timeout");
  app.quit();
}

function createWindow() {
  if (!fs.existsSync(STATIC_PAGE)) {
    fatal(
      "The local app build is missing.\n\n" +
        "Expected: " + STATIC_PAGE + "\n\n" +
        "Run 'npm install' and 'npm run build:static' in the project folder, then start the app again.",
    );
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 920,
    minHeight: 640,
    title: "Job Search Suite",
    backgroundColor: "#080b14",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    fatal("Could not open the local app build.\n\n" + description + " (error " + code + ")");
  });

  // Keep the app on its own local page; send ordinary links to the system browser.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url === APP_URL) return;
    event.preventDefault();
    openExternally(url);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: "deny" };
  });

  if (SMOKE) mainWindow.webContents.once("did-finish-load", () => void smokeCheck());

  mainWindow.loadURL(APP_URL);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    buildMenu();
    configureDownloads();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
