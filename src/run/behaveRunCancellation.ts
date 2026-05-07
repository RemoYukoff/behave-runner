import type { ChildProcess } from "child_process";
import * as vscode from "vscode";

/** Merged with caller token so the Live panel Stop button can cancel the active run. */
let activeRunCancellation: vscode.CancellationTokenSource | undefined;

/** shell-spawned Behave root process (see `spawnBehave`). */
let trackedBehaveSpawn: ChildProcess | undefined;

export function registerTrackedBehaveSpawn(proc: ChildProcess): void {
  trackedBehaveSpawn = proc;
}

export function unregisterTrackedBehaveSpawn(proc: ChildProcess): void {
  if (trackedBehaveSpawn === proc) {
    trackedBehaveSpawn = undefined;
  }
}

/**
 * Best-effort terminate using only Node `ChildProcess.kill` / `process.kill`
 * (no external OS helpers). With `shell: true`, this targets the shell child first.
 */
export function forceKillTrackedBehaveSpawn(): void {
  const p = trackedBehaveSpawn;
  if (!p || p.pid == null) {
    return;
  }
  const pid = p.pid;
  try {
    p.kill("SIGKILL");
    return;
  } catch {
    /* fall through */
  }
  try {
    p.kill();
    return;
  } catch {
    /* fall through */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid);
    } catch {
      /* ESRCH etc. */
    }
  }
}

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
  forceKillTrackedBehaveSpawn();
  activeRunCancellation?.cancel();
}
