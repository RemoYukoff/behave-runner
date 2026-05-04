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
  const provider = new LiveRunWebviewProvider(context.extensionUri);
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

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    LiveRunWebviewProvider.instance = this;
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri]
    };
    webviewView.webview.html = loadLiveRunHtml(this.extensionUri);
  }

  post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}
