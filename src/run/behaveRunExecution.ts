import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { BehaveHierarchyNode } from "../behaveHierarchyModel";
import { resolveBehaveFeatureChildrenIfNeeded } from "../behaveHierarchyModel";
import {
  dispatchLiveStreamEvent,
  flushPendingHookStdout
} from "../behaveLiveStreamDispatch";
import {
  NdjsonStdoutBuffer,
  parseLiveStreamLine
} from "../behaveLiveStreamParse";
import type { LiveStreamJob } from "../behaveLiveStreamTypes";
import { getBehaveRunnerContext } from "../behaveRunnerContext";
import { revealLiveRunPanel } from "../liveRunWebview";
import type { LivePanelToWebviewMessage } from "../ui/livePanelProtocol";
import { getPythonInterpreterPath } from "../pythonInterpreter";
import type { BehaveJob } from "./behaveJobTypes";
import { getWorkspaceRootForFile, planJobs } from "./behaveJobTypes";
import {
  releaseActiveRunCancellation,
  takeOverActiveRunCancellation
} from "./behaveRunCancellation";
import type { BehaveRunSinks } from "./behaveRunPorts";
import { runBehaveDebugJobs } from "./behaveRunDebug";
import { rememberBehaveRun } from "./behaveRunLastRun";
import { liveFormatterBundlePath, spawnBehave } from "./behaveRunSpawn";

function appendOutputForNode(
  sinks: BehaveRunSinks,
  text: string,
  _test?: BehaveHierarchyNode,
  _location?: vscode.Location
): void {
  sinks.output.append(text);
}

async function runBehaveJob(
  job: BehaveJob,
  token: vscode.CancellationToken,
  sinks: BehaveRunSinks,
  extensionPath: string,
  liveOpts?: { skipLivePanelReset?: boolean }
): Promise<void> {
  const featureItem = job.featureItem;
  const fsPath = job.fsPath;
  await resolveBehaveFeatureChildrenIfNeeded(featureItem);

  const appendOut = (
    text: string,
    test?: BehaveHierarchyNode,
    loc?: vscode.Location
  ): void => appendOutputForNode(sinks, text, test, loc);

  let runJob: BehaveJob = job;
  if (job.kind === "scenario") {
    const freshScenario = featureItem.children.get(job.scenarioItem.id);
    if (!freshScenario) {
      sinks.output.append(
        `[Behave Runner] Scenario "${job.scenarioName}" not found under ${path.basename(fsPath)} after refresh.\r\n`
      );
      return;
    }
    runJob = {
      kind: "scenario",
      featureItem,
      scenarioItem: freshScenario,
      scenarioName: job.scenarioName,
      fsPath: job.fsPath
    };
  }

  const workspaceRoot = getWorkspaceRootForFile(fsPath);
  const interpreter = getPythonInterpreterPath(fsPath, workspaceRoot);

  const liveFormatterRoot = liveFormatterBundlePath(extensionPath);
  const liveBundlePresent = fs.existsSync(
    path.join(liveFormatterRoot, "behave_runner_live", "__init__.py")
  );

  if (!liveBundlePresent || extensionPath.length === 0) {
    const msg =
      "Behave Runner needs the bundled live stream formatter under media/python/behave_runner_live (reinstall or rebuild the extension).";
    sinks.output.append(`[Behave Runner] ${msg}\r\n`);
    void vscode.window.showErrorMessage(msg);
    return;
  }

  let exitCode = 0;

  let pendingLiveStderr = "";
  let attachLiveStderrToStepKey: string | undefined;
  let lastLiveStepScenarioKey = "";

  function livePanelSinkWrap(message: LivePanelToWebviewMessage): void {
    if (message.type === "feature" || message.type === "scenario") {
      pendingLiveStderr = "";
      attachLiveStderrToStepKey = undefined;
    } else if (message.type === "step") {
      lastLiveStepScenarioKey = message.scenarioKey;
      const st = message.status.toLowerCase();
      const failed = st === "failed" || st === "error";
      if (failed) {
        const pend = pendingLiveStderr;
        pendingLiveStderr = "";
        if (pend.trim()) {
          const lt = message.logText;
          const sep = lt.length > 0 && !lt.endsWith("\n") ? "\n" : "";
          message.logText = lt + sep + pend;
          const er = message.error;
          message.error = er ? `${er}\n\n${pend}` : pend;
        }
        attachLiveStderrToStepKey =
          message.stepKey.length > 0 ? message.stepKey : undefined;
      } else {
        attachLiveStderrToStepKey = undefined;
        pendingLiveStderr = "";
      }
    }
    sinks.livePanel.post(message);
  }

  try {
    if (!liveOpts?.skipLivePanelReset) {
      sinks.livePanel.clear();
      sinks.livePanel.post({
        type: "feature",
        label: featureItem.label
      });
    }

    const liveJob: LiveStreamJob =
      runJob.kind === "feature"
        ? { kind: "feature" }
        : {
            kind: "scenario",
            scenarioName: runJob.scenarioName,
            scenarioItem: runJob.scenarioItem
          };

    const ndjsonBuf = new NdjsonStdoutBuffer();
    let pendingPlainStdout = "";
    const hookFlushState: { lastScenarioKey?: string } = {};

    const liveDispatchCtx = {
      featureItem,
      job: liveJob,
      fsPath,
      workspaceRoot,
      appendOutput: appendOut,
      livePanelSink: livePanelSinkWrap,
      consumePendingStdout: (): string => {
        const s = pendingPlainStdout;
        pendingPlainStdout = "";
        return s;
      },
      hookFlushState
    };

    const proc = spawnBehave(runJob, workspaceRoot, interpreter.path, {
      liveFormatterPythonRoot: liveFormatterRoot
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      token.onCancellationRequested(() => {
        proc.kill();
      });

      const onStdoutChunk = (chunk: Buffer): void => {
        const text = chunk.toString();
        for (const line of ndjsonBuf.consumeChunk(text)) {
          sinks.output.append(line);
          const ev = parseLiveStreamLine(line);
          if (ev) {
            dispatchLiveStreamEvent(ev, liveDispatchCtx);
          } else {
            pendingPlainStdout += line + "\n";
          }
        }
      };

      proc.stdout.on("data", onStdoutChunk);
      proc.stderr.on("data", (chunk: Buffer) => {
        const t = chunk.toString();
        sinks.output.append(t);
        if (attachLiveStderrToStepKey) {
          sinks.livePanel.post({
            type: "step_log_append",
            stepKey: attachLiveStderrToStepKey,
            scenarioKey: lastLiveStepScenarioKey,
            text: t
          });
        } else {
          pendingLiveStderr += t;
        }
      });
      proc.on("error", (err) => {
        rejectPromise(err);
      });
      proc.on("close", (code) => {
        exitCode = code ?? 0;
        const tail = ndjsonBuf.flushLine();
        if (tail) {
          sinks.output.append(tail);
          const ev = parseLiveStreamLine(tail);
          if (ev) {
            dispatchLiveStreamEvent(ev, liveDispatchCtx);
          } else {
            pendingPlainStdout += tail + "\n";
          }
        }
        flushPendingHookStdout(liveDispatchCtx, {
          scenarioKey: hookFlushState.lastScenarioKey
        });
        resolvePromise();
      });
    });

    if (exitCode !== 0) {
      sinks.output.append(
        `[Behave Runner] Behave exited with code ${exitCode}.\r\n`
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sinks.output.append(`Behave Runner error: ${msg}\r\n`);
    void vscode.window.showErrorMessage(`Behave Runner: ${msg}`);
  } finally {
    if (token.isCancellationRequested) {
      sinks.livePanel.post({ type: "runCancelled" });
    }
  }
}

export async function runBehaveJobs(
  jobs: BehaveJob[],
  token: vscode.CancellationToken
): Promise<void> {
  const ctx = getBehaveRunnerContext();
  if (!ctx) {
    void vscode.window.showErrorMessage(
      "Behave Runner: extension context is not ready."
    );
    return;
  }
  const { runSinks: sinks, extensionPath } = ctx;

  rememberBehaveRun("run", jobs);
  const runCts = takeOverActiveRunCancellation();
  const parentReg = token.onCancellationRequested(() => runCts.cancel());
  try {
    const batchSameFeatureScenarios =
      jobs.length > 1 &&
      jobs.every((j) => j.kind === "scenario") &&
      jobs.every((j) => j.fsPath === jobs[0].fsPath);

    for (let i = 0; i < jobs.length; i++) {
      if (runCts.token.isCancellationRequested) {
        break;
      }
      await runBehaveJob(jobs[i], runCts.token, sinks, extensionPath, {
        skipLivePanelReset: batchSameFeatureScenarios && i > 0
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    sinks.output.append(`Behave Runner error: ${msg}\r\n`);
    void vscode.window.showErrorMessage(`Behave Runner: ${msg}`);
  } finally {
    parentReg.dispose();
    releaseActiveRunCancellation(runCts);
    sinks.livePanel.persistCapture();
  }
}

export async function runBehaveHierarchySelection(
  items: BehaveHierarchyNode[],
  token: vscode.CancellationToken
): Promise<void> {
  await revealLiveRunPanel();
  await runBehaveJobs(planJobs(items), token);
}

export async function runBehaveHierarchyDebugSelection(
  items: BehaveHierarchyNode[],
  token: vscode.CancellationToken
): Promise<void> {
  await revealLiveRunPanel();
  await runBehaveDebugJobs(planJobs(items), token);
}
