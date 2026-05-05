import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const VIEW_TYPE = "behaveRunner.liveRun";

/** Opens the bottom panel and focuses the Live run view (e.g. when starting Run/Debug). */
export async function revealLiveRunPanel(): Promise<void> {
  try {
    await vscode.commands.executeCommand("behaveRunner.liveRun.focus");
  } catch {
    /* view not ready */
  }
}

export function registerLiveRunWebview(
  context: vscode.ExtensionContext
): void {
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
  LiveRunWebviewProvider.instance?.post(message);
}

export function clearLiveRunPanel(): void {
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
    webviewView.webview.html = loadLiveRunHtml(this.extensionUri);

    this.extContext.subscriptions.push(
      webviewView.webview.onDidReceiveMessage((msg: unknown) => {
        void handleLiveRunWebviewMessage(msg);
      })
    );
  }

  post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}

async function handleLiveRunWebviewMessage(msg: unknown): Promise<void> {
  if (typeof msg !== "object" || msg === null) {
    return;
  }
  const m = msg as Record<string, unknown>;
  if (m.type === "stopRun") {
    await vscode.commands.executeCommand("behaveRunner.cancelRun");
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
