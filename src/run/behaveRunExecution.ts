import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  applyBehaveJsonReport,
  type BehaveJsonApplyResult,
  type BehaveTreeStepOutcome
} from "../behaveJsonReport";
import type { BehaveHierarchyNode } from "../behaveHierarchyModel";
import {
  resolveBehaveFeatureChildrenIfNeeded,
  SCEN_PREFIX
} from "../behaveHierarchyModel";
import {
  dispatchLiveStreamEvent,
  liveStreamStatusToTreeStatus,
  NdjsonStdoutBuffer,
  parseLiveStreamLine,
  type LiveStreamJob
} from "../behaveLiveStream";
import { clearBehaveRunState, setBehaveTreeStatus } from "../behaveRunState";
import {
  clearLiveRunPanel,
  persistLivePanelCaptureNow,
  postLiveRunMessage
} from "../behaveRunnerServices";
import { revealLiveRunPanel } from "../liveRunWebview";
import type { LivePanelToWebviewMessage } from "../ui/livePanelProtocol";
import { getPythonInterpreterPath } from "../pythonInterpreter";
import type { BehaveJob } from "./behaveJobTypes";
import {
  directFeatureChildren,
  getWorkspaceRootForFile,
  planJobs
} from "./behaveJobTypes";
import {
  releaseActiveRunCancellation,
  takeOverActiveRunCancellation
} from "./behaveRunCancellation";
import { getBehaveRunnerExtensionPath } from "../behaveRunnerServices";
import { runBehaveDebugJobs } from "./behaveRunDebug";
import { rememberBehaveRun } from "./behaveRunLastRun";
import { appendRunOutput } from "./behaveRunOutput";
import { liveFormatterBundlePath, spawnBehave } from "./behaveRunSpawn";

function appendOutputForNode(
  text: string,
  _test?: BehaveHierarchyNode,
  _location?: vscode.Location
): void {
  appendRunOutput(text);
}

function enqueueAndStartScenarioItems(
  job: BehaveJob,
  featureItem: BehaveHierarchyNode
): void {
  const roots = directFeatureChildren(featureItem);
  const touchScenario = (scenario: BehaveHierarchyNode): void => {
    setBehaveTreeStatus(scenario.id, "running");
  };
  if (job.kind === "feature") {
    for (const child of roots) {
      if (child.id.startsWith(SCEN_PREFIX)) {
        touchScenario(child);
      }
    }
    return;
  }
  if (job.scenarioItem.parent === featureItem) {
    touchScenario(job.scenarioItem);
  }
}

function failScenarioItemsWithoutJson(
  job: BehaveJob,
  featureItem: BehaveHierarchyNode,
  message: string
): void {
  const roots = directFeatureChildren(featureItem);
  if (job.kind === "feature") {
    for (const child of roots) {
      if (child.id.startsWith(SCEN_PREFIX)) {
        setBehaveTreeStatus(child.id, "failed");
      }
    }
    appendRunOutput(`${message}\r\n`);
    return;
  }
  if (job.scenarioItem.parent === featureItem) {
    setBehaveTreeStatus(job.scenarioItem.id, "failed");
    appendRunOutput(`${message}\r\n`);
  }
}

async function runBehaveJob(
  job: BehaveJob,
  token: vscode.CancellationToken,
  extensionPath: string,
  liveOpts?: { skipLivePanelReset?: boolean }
): Promise<void> {
  const featureItem = job.featureItem;
  const fsPath = job.fsPath;
  await resolveBehaveFeatureChildrenIfNeeded(featureItem);

  let runJob: BehaveJob = job;
  if (job.kind === "scenario") {
    const freshScenario = featureItem.children.get(job.scenarioItem.id);
    if (!freshScenario) {
      appendRunOutput(
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
  const useLiveStream = liveBundlePresent && extensionPath.length > 0;

  if (!liveBundlePresent && extensionPath.length > 0) {
    appendRunOutput(
      "[Behave Runner] Live stream formatter bundle missing; install/rebuild the extension.\r\n"
    );
  }

  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "behave-runner-")
  );
  const tmpJson = path.join(tmpDir, "report.json");

  let exitCode = 0;
  let jobItemsPrimed = false;

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
    postLiveRunMessage(message);
  }

  try {
    enqueueAndStartScenarioItems(runJob, featureItem);
    jobItemsPrimed = true;

    if (!liveOpts?.skipLivePanelReset) {
      clearLiveRunPanel();
      if (useLiveStream) {
        postLiveRunMessage({
          type: "feature",
          label: featureItem.label
        });
      }
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

    const liveDispatchCtx = {
      featureItem,
      job: liveJob,
      fsPath,
      workspaceRoot,
      appendOutput: appendOutputForNode,
      livePanelSink: livePanelSinkWrap,
      onStepTreeStatus: (
        stepItem: BehaveHierarchyNode | undefined,
        raw: string
      ): void => {
        if (!stepItem) {
          return;
        }
        if (raw === "running") {
          setBehaveTreeStatus(stepItem.id, "running");
          return;
        }
        setBehaveTreeStatus(stepItem.id, liveStreamStatusToTreeStatus(raw));
      },
      consumePendingStdout: (): string => {
        const s = pendingPlainStdout;
        pendingPlainStdout = "";
        return s;
      }
    };

    const proc = spawnBehave(runJob, workspaceRoot, interpreter.path, tmpJson, {
      liveStream: useLiveStream,
      liveFormatterPythonRoot: useLiveStream ? liveFormatterRoot : undefined
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      token.onCancellationRequested(() => {
        proc.kill();
      });

      const onStdoutChunk = (chunk: Buffer): void => {
        const text = chunk.toString();
        if (useLiveStream) {
          for (const line of ndjsonBuf.consumeChunk(text)) {
            appendRunOutput(line);
            const ev = parseLiveStreamLine(line);
            if (ev) {
              dispatchLiveStreamEvent(ev, liveDispatchCtx);
            } else {
              pendingPlainStdout += line + "\n";
            }
          }
        } else {
          appendRunOutput(text);
        }
      };

      proc.stdout.on("data", onStdoutChunk);
      proc.stderr.on("data", (chunk: Buffer) => {
        const t = chunk.toString();
        appendRunOutput(t);
        if (useLiveStream) {
          if (attachLiveStderrToStepKey) {
            postLiveRunMessage({
              type: "step_log_append",
              stepKey: attachLiveStderrToStepKey,
              scenarioKey: lastLiveStepScenarioKey,
              text: t
            });
          } else {
            pendingLiveStderr += t;
          }
        }
      });
      proc.on("error", (err) => {
        rejectPromise(err);
      });
      proc.on("close", (code) => {
        exitCode = code ?? 0;
        if (useLiveStream) {
          const tail = ndjsonBuf.flushLine();
          if (tail) {
            appendRunOutput(tail);
            const ev = parseLiveStreamLine(tail);
            if (ev) {
              dispatchLiveStreamEvent(ev, liveDispatchCtx);
            } else {
              pendingPlainStdout += tail + "\n";
            }
          }
        }
        resolvePromise();
      });
    });

    let jsonText = "";
    try {
      jsonText = await fs.promises.readFile(tmpJson, "utf-8");
    } catch {
      appendRunOutput(
        "[Behave Runner] Behave did not write a JSON report (process may have crashed).\r\n"
      );
    }

    const applyJob =
      runJob.kind === "feature"
        ? { kind: "feature" as const, fsPath, workspaceRoot }
        : {
            kind: "scenario" as const,
            fsPath,
            scenarioName: runJob.scenarioName,
            scenarioItemId: runJob.scenarioItem.id,
            workspaceRoot
          };

    let jsonResult: BehaveJsonApplyResult | undefined;
    if (jsonText.length > 0) {
      jsonResult = applyBehaveJsonReport(
        featureItem,
        applyJob,
        jsonText,
        appendOutputForNode,
        {
          omitPrintedOutput: useLiveStream,
          onStepOutcome: (
            stepItem: BehaveHierarchyNode,
            outcome: BehaveTreeStepOutcome
          ) => {
            setBehaveTreeStatus(stepItem.id, outcome);
          },
          onScenarioOutcome: (
            scenarioItem: BehaveHierarchyNode,
            outcome: "passed" | "failed"
          ) => {
            setBehaveTreeStatus(scenarioItem.id, outcome);
          }
        }
      );
    }

    if (!jsonResult?.applied) {
      failScenarioItemsWithoutJson(
        runJob,
        featureItem,
        jsonText.length === 0
          ? "Behave finished without a usable JSON report; step results are unavailable."
          : "Behave JSON report did not include this feature or could not be read."
      );
    }

    if (exitCode !== 0) {
      appendRunOutput(
        `[Behave Runner] Behave exited with code ${exitCode}.\r\n`
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendRunOutput(`Behave Runner error: ${msg}\r\n`);
    if (jobItemsPrimed) {
      failScenarioItemsWithoutJson(
        runJob,
        featureItem,
        `Behave Runner error: ${msg}`
      );
    }
  } finally {
    if (token.isCancellationRequested) {
      postLiveRunMessage({ type: "runCancelled" });
    }
    await fs.promises.rm(tmpDir, { recursive: true }).catch(() => {});
  }
}

export async function runBehaveJobs(
  jobs: BehaveJob[],
  token: vscode.CancellationToken,
  extensionPath: string
): Promise<void> {
  rememberBehaveRun("run", jobs);
  const runCts = takeOverActiveRunCancellation();
  const parentReg = token.onCancellationRequested(() => runCts.cancel());
  clearBehaveRunState();
  try {
    const batchSameFeatureScenarios =
      jobs.length > 1 &&
      jobs.every((j) => j.kind === "scenario") &&
      jobs.every((j) => j.fsPath === jobs[0].fsPath);

    for (let i = 0; i < jobs.length; i++) {
      if (runCts.token.isCancellationRequested) {
        break;
      }
      await runBehaveJob(jobs[i], runCts.token, extensionPath, {
        skipLivePanelReset: batchSameFeatureScenarios && i > 0
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    appendRunOutput(`Behave Runner error: ${msg}\r\n`);
    void vscode.window.showErrorMessage(`Behave Runner: ${msg}`);
  } finally {
    parentReg.dispose();
    releaseActiveRunCancellation(runCts);
    persistLivePanelCaptureNow();
  }
}

export async function runBehaveHierarchySelection(
  items: BehaveHierarchyNode[],
  token: vscode.CancellationToken
): Promise<void> {
  await revealLiveRunPanel();
  await runBehaveJobs(planJobs(items), token, getBehaveRunnerExtensionPath());
}

export async function runBehaveHierarchyDebugSelection(
  items: BehaveHierarchyNode[],
  token: vscode.CancellationToken
): Promise<void> {
  await revealLiveRunPanel();
  await runBehaveDebugJobs(planJobs(items), token);
}

export { planJobs, type BehaveJob } from "./behaveJobTypes";
