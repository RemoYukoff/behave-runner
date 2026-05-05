import * as vscode from "vscode";

/** Merged with caller token so the Live panel Stop button can cancel the active run. */
let activeRunCancellation: vscode.CancellationTokenSource | undefined;

export function takeOverActiveRunCancellation(): vscode.CancellationTokenSource {
  activeRunCancellation?.cancel();
  const cts = new vscode.CancellationTokenSource();
  activeRunCancellation = cts;
  return cts;
}

export function releaseActiveRunCancellation(
  cts: vscode.CancellationTokenSource
): void {
  if (activeRunCancellation === cts) {
    activeRunCancellation = undefined;
  }
  cts.dispose();
}

export function cancelActiveBehaveRun(): void {
  activeRunCancellation?.cancel();
}
