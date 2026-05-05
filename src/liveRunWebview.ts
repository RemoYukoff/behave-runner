import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const VIEW_TYPE = "behaveRunner.liveRun";

const LIVE_PANEL_CAPTURE_KEY = "behaveRunner.livePanelCapture.v1";
/** Rough budget for `workspaceState` (limit is ~1MB per key). */
const MAX_CAPTURE_JSON_BYTES = 750_000;

let workspaceStateForLivePanel: vscode.Memento | undefined;

/** Messages posted to the Live panel during the current / last run (for workspace restore). */
let livePanelCapture: unknown[] = [];

/** Opens the bottom panel and focuses the Live run view (e.g. when starting Run/Debug). */
export async function revealLiveRunPanel(): Promise<void> {
  try {
    await vscode.commands.executeCommand("behaveRunner.liveRun.focus");
  } catch {
    /* view not ready */
  }
}

function cloneForCapture(message: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(message)) as unknown;
  } catch {
    return message;
  }
}

function trimMessagesForStorage(messages: unknown[]): unknown[] {
  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") {
      return msg;
    }
    const o = msg as Record<string, unknown>;
    const copy: Record<string, unknown> = { ...o };
    if (typeof copy.logText === "string" && copy.logText.length > 8000) {
      copy.logText =
        copy.logText.slice(0, 8000) +
        "\n… [Behave Runner: truncated for storage]";
    }
    if (typeof copy.error === "string" && copy.error.length > 16000) {
      copy.error =
        copy.error.slice(0, 16000) + "\n… [Behave Runner: truncated]";
    }
    if (typeof copy.text === "string" && copy.text.length > 12000) {
      copy.text =
        copy.text.slice(0, 12000) + "\n… [Behave Runner: truncated]";
    }
    return copy;
  });
}

function shrinkCaptureIfNeeded(messages: unknown[]): unknown[] {
  let data = trimMessagesForStorage(messages);
  let json = JSON.stringify(data);
  if (json.length <= MAX_CAPTURE_JSON_BYTES) {
    return data;
  }
  data = messages.map((msg) => {
    if (!msg || typeof msg !== "object") {
      return msg;
    }
    const o = msg as Record<string, unknown>;
    const copy: Record<string, unknown> = { ...o };
    if (typeof copy.logText === "string") {
      copy.logText = `${copy.logText.slice(0, 400)}\n… [truncated]`;
    }
    if (typeof copy.error === "string") {
      copy.error = `${copy.error.slice(0, 400)}\n… [truncated]`;
    }
    if (typeof copy.text === "string") {
      copy.text = `${copy.text.slice(0, 400)}\n… [truncated]`;
    }
    return copy;
  });
  json = JSON.stringify(data);
  while (json.length > MAX_CAPTURE_JSON_BYTES) {
    const prevLen = data.length;
    data = data.filter((m, i) => {
      if (i === 0) {
        return true;
      }
      return (
        typeof m !== "object" ||
        m === null ||
        (m as { type?: string }).type !== "step_log_append"
      );
    });
    if (data.length === prevLen) {
      break;
    }
    json = JSON.stringify(data);
  }
  return data;
}

/** Persist the captured Live panel message log for this workspace (after a Run finishes). */
export function persistLivePanelCaptureNow(): void {
  const memento = workspaceStateForLivePanel;
  if (!memento || livePanelCapture.length <= 1) {
    return;
  }
  try {
    const data = shrinkCaptureIfNeeded(livePanelCapture);
    const json = JSON.stringify(data);
    if (json.length > MAX_CAPTURE_JSON_BYTES) {
      return;
    }
    void memento.update(LIVE_PANEL_CAPTURE_KEY, data);
  } catch {
    /* ignore */
  }
}

export function registerLiveRunWebview(
  context: vscode.ExtensionContext
): void {
  workspaceStateForLivePanel = context.workspaceState;
  const provider = new LiveRunWebviewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(VIEW_TYPE, provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("behaveRunner.showLiveRun", async () => {
      await vscode.commands.executeCommand("behaveRunner.liveRun.focus");
    })
  );
}

/** All Live run UI updates go through here (from the Behave NDJSON live stream only). */
export function postLiveRunMessage(message: unknown): void {
  livePanelCapture.push(cloneForCapture(message));
  LiveRunWebviewProvider.instance?.post(message);
}

export function clearLiveRunPanel(): void {
  livePanelCapture = [{ type: "clear" }];
  LiveRunWebviewProvider.instance?.post({ type: "clear" });
}

function loadLiveRunHtml(extensionUri: vscode.Uri): string {
  const filePath = path.join(extensionUri.fsPath, "media", "liveRunPanel.html");
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:12px">Behave Runner: could not read <code>media/liveRunPanel.html</code>.</body></html>`;
  }
}

function buildLiveRunPanelHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  let html = loadLiveRunHtml(extensionUri);
  const codiconCss = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "media", "codicons", "codicon.css")
  );
  const csp = [
    "default-src 'none'",
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `font-src ${webview.cspSource}`,
    "script-src 'unsafe-inline'"
  ].join("; ");
  html = html.replace("BEHAVE_RUN_CSP_PLACEHOLDER", csp);
  html = html.replace(
    "BEHAVE_RUN_CODICON_LINK_PLACEHOLDER",
    `<link rel="stylesheet" href="${codiconCss}" />`
  );
  return html;
}

class LiveRunWebviewProvider implements vscode.WebviewViewProvider {
  static instance: LiveRunWebviewProvider | undefined;

  private view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly extContext: vscode.ExtensionContext
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    LiveRunWebviewProvider.instance = this;
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = buildLiveRunPanelHtml(
      webviewView.webview,
      this.extensionUri
    );

    this.extContext.subscriptions.push(
      webviewView.webview.onDidReceiveMessage((msg: unknown) => {
        void handleLiveRunWebviewMessage(webviewView.webview, msg);
      })
    );
  }

  post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}

function postStoredLivePanelReplay(webview: vscode.Webview): void {
  const memento = workspaceStateForLivePanel;
  if (!memento) {
    return;
  }
  const saved = memento.get<unknown[]>(LIVE_PANEL_CAPTURE_KEY);
  if (!Array.isArray(saved) || saved.length === 0) {
    return;
  }
  void webview.postMessage({ type: "replayCapture", messages: saved });
}

async function handleLiveRunWebviewMessage(
  webview: vscode.Webview,
  msg: unknown
): Promise<void> {
  if (typeof msg !== "object" || msg === null) {
    return;
  }
  const m = msg as Record<string, unknown>;
  if (m.type === "livePanelReady") {
    postStoredLivePanelReplay(webview);
    return;
  }
  if (m.type === "stopRun") {
    await vscode.commands.executeCommand("behaveRunner.cancelRun");
    return;
  }
  if (m.type === "rerunLastRun") {
    await vscode.commands.executeCommand("behaveRunner.rerunLastRun");
    return;
  }
  if (m.type !== "revealStep") {
    return;
  }
  const fsPath =
    typeof m.path === "string"
      ? m.path
      : typeof m.gotoPath === "string"
        ? m.gotoPath
        : "";
  let lineRaw = NaN;
  if (typeof m.line === "number" && Number.isFinite(m.line)) {
    lineRaw = Math.floor(m.line);
  } else if (typeof m.gotoLine === "number" && Number.isFinite(m.gotoLine)) {
    lineRaw = Math.floor(m.gotoLine);
  } else if (typeof m.line === "string") {
    const n = Number.parseInt(m.line, 10);
    lineRaw = Number.isNaN(n) ? NaN : n;
  } else if (typeof m.gotoLine === "string") {
    const n = Number.parseInt(m.gotoLine, 10);
    lineRaw = Number.isNaN(n) ? NaN : n;
  }
  if (!fsPath || Number.isNaN(lineRaw)) {
    return;
  }
  const line0 = Math.max(0, lineRaw);
  try {
    const uri = vscode.Uri.file(fsPath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const capped = Math.min(line0, Math.max(0, doc.lineCount - 1));
    const pos = doc.lineAt(capped).range.start;
    await vscode.window.showTextDocument(doc, {
      selection: new vscode.Selection(pos, pos),
      preserveFocus: false,
      preview: false
    });
  } catch {
    /* file missing or inaccessible */
  }
}
