import { createLogger } from "@shared/utils/console";
import { BrowserWindow, screen, shell } from "electron";
import Store from "electron-store";
import path, { join } from "path";
import appIconPath from "~/build/favicon.ico?asset";
import { isDevelopment } from "./devUtils";
import { loadUrlOfWindow, syncWindowStateToWebContents } from "./webContentUtils";
type WindowOptions = {
  path: string;
  parent: BrowserWindow;
  minHeight?: number;
  minWidth?: number;
  maxHeight?: number;
  maxWidth?: number;
  height?: number;
  width?: number;
  top?: boolean;
  showTaskBar?: boolean;
  maximizeable?: boolean;
  minimizeable?: boolean;
};
const log = createLogger("main");
export function parseScriptPath(p: string) {
  log.child("parseScriptPath").debug(__dirname, p)
  return path.join(__dirname, "../preload", p);
}
export async function createAppWindow(appOptions?: Partial<WindowOptions>) {
  // eslint-disable-next-line prefer-const
  let {
    parent,
    path,
    minHeight,
    minWidth,
    maxHeight,
    maxWidth,
    height,
    width,
    top,
    showTaskBar,
    minimizeable,
    maximizeable,
  } = appOptions ?? {};
  if (!path) path = "/";
  // Create the browser window.
  const win = new BrowserWindow({
    width: width ?? 800,
    height: height ?? 600,
    minWidth: minWidth ?? 800,
    minHeight: minHeight ?? 480,
    maxWidth,
    maxHeight,
    minimizable: minimizeable === true,
    maximizable: maximizeable === true,
    backgroundColor: "#000000",
    fullscreenable: !maxWidth && !maxWidth,
    icon: appIconPath,
    frame: false,
    parent,
    modal: parent && top === true,
    skipTaskbar: showTaskBar === false,
    darkTheme: true,
    webPreferences: {
      // Use pluginOptions.nodeIntegration, leave this alone
      // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
      nodeIntegration: import.meta.env.ELECTRON_NODE_INTEGRATION === "true",
      contextIsolation: true,
      sandbox: false,
      preload: join(__dirname, "../preload/api.js"),
    },
  });
  await loadUrlOfWindow(win, path)
  if (isDevelopment) win.webContents.openDevTools();
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  syncWindowStateToWebContents(win)(win.webContents);
  console.log(`[${win.id}, show], syncWindowStateToWebContents, ${win.title}`);
  return win;
}

export async function wrapWindowHandler(
  win: BrowserWindow,
  windowName: string,
  { width: defaultWidth, height: defaultHeight }: { width: number; height: number },
) {
  const key = "window-state";
  const name = `window-state-${windowName}`;
  const store = new Store({ name });
  const defaultSize = {
    width: defaultWidth,
    height: defaultHeight,
  };
  let state: { width: number; height: number; x: number; y: number; maximized?: boolean } = null;
  const restore = () => store.get(key, defaultSize);

  const getCurrentPosition = () => {
    const [x, y] = win.getPosition();
    const [width, height] = win.getSize();
    return {
      x,
      y,
      width,
      height,
      maximized: win.isMaximized(),
    };
  };

  const windowWithinBounds = (windowState, bounds) => {
    return (
      windowState.x >= bounds.x &&
      windowState.y >= bounds.y &&
      windowState.x + windowState.width <= bounds.x + bounds.width &&
      windowState.y + windowState.height <= bounds.y + bounds.height
    );
  };

  const resetToDefaults = () => {
    const bounds = screen.getPrimaryDisplay().bounds;
    return Object.assign({}, defaultSize, {
      x: (bounds.width - defaultSize.width) / 2,
      y: (bounds.height - defaultSize.height) / 2,
    });
  };

  const ensureVisibleOnSomeDisplay = (windowState) => {
    const visible = screen.getAllDisplays().some((display) => {
      return windowWithinBounds(windowState, display.bounds);
    });
    if (!visible) {
      // Window is partially or fully not visible now.
      // Reset it to safe defaults.
      return resetToDefaults();
    }
    return windowState;
  };
  const saveState = () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      Object.assign(state, getCurrentPosition());
    }
    store.set(key, state);
  };
  state = ensureVisibleOnSomeDisplay(restore());
  win.on("close", saveState);
  return { state, saveState };
}
export { appIconPath };