import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import {
  applyBehaveJsonReport,
  type BehaveJsonApplyResult,
  type BehaveTreeStepOutcome
} from "./behaveJsonReport";
import {
  BG_PREFIX,
  type BehaveHierarchyStore,
  FEATURE_PREFIX,
  type BehaveHierarchyNode,
  listOutlineExpansionsForHeader,
  resolveBehaveFeatureChildrenIfNeeded,
  SCEN_PREFIX
} from "./behaveHierarchyModel";
import {
  dispatchLiveStreamEvent,
  liveStreamStatusToTreeStatus,
  NdjsonStdoutBuffer,
  parseLiveStreamLine,
  type LiveStreamJob
} from "./behaveLiveStream";
import {
  clearBehaveRunState,
  refreshBehaveHierarchy,
  setBehaveTreeStatus
} from "./behaveRunState";
import {
  clearLiveRunPanel,
  postLiveRunMessage,
  revealLiveRunPanel
} from "./liveRunWebview";
import { getPythonInterpreterPath } from "./pythonInterpreter";

let behaveRunnerExtensionPath = "";

let behaveOutputChannel: vscode.OutputChannel | undefined;

/** Merged with caller token so the Live panel Stop button can cancel the active run. */
let activeRunCancellation: vscode.CancellationTokenSource | undefined;

function takeOverActiveRunCancellation(): vscode.CancellationTokenSource {
  activeRunCancellation?.cancel();
  const cts = new vscode.CancellationTokenSource();
  activeRunCancellation = cts;
  return cts;
}

function releaseActiveRunCancellation(cts: vscode.CancellationTokenSource): void {
  if (activeRunCancellation === cts) {
    activeRunCancellation = undefined;
  }
  cts.dispose();
}

/** Cancels the current Behave run (spawned via Test UI / gutter) or requests the debugger to stop. */
export function cancelActiveBehaveRun(): void {
  activeRunCancellation?.cancel();
}

function getBehaveOutputChannel(): vscode.OutputChannel {
  if (!behaveOutputChannel) {
    behaveOutputChannel = vscode.window.createOutputChannel("Behave Runner");
  }
  return behaveOutputChannel;
}

function isLivePanelMessage(msg: unknown): msg is Record<string, unknown> {
  return typeof msg === "object" && msg !== null && !Array.isArray(msg);
}

export function setBehaveRunnerExtensionPath(extensionPath: string): void {
  behaveRunnerExtensionPath = extensionPath ?? "";
}

function normalizeFsPath(p: string): string {
  return path.normalize(p).replace(/\\/g, "/").toLowerCase();
}

export type BehaveJob =
  | { kind: "feature"; featureItem: BehaveHierarchyNode; fsPath: string }
  | {
      kind: "scenario";
      featureItem: BehaveHierarchyNode;
      scenarioItem: BehaveHierarchyNode;
      scenarioName: string;
      fsPath: string;
    };

function toOutputChunk(text: string): string {
  const normalized = text.includes("\r\n") ? text : text.replace(/\n/g, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : normalized + "\r\n";
}

function appendRunOutput(text: string): void {
  getBehaveOutputChannel().append(toOutputChunk(text));
}

function appendOutputForNode(
  text: string,
  _test?: BehaveHierarchyNode,
  _location?: vscode.Location
): void {
  appendRunOutput(text);
}

function directFeatureChildren(
  featureItem: BehaveHierarchyNode
): BehaveHierarchyNode[] {
  return [...featureItem.children.values()].filter(
    (ch) => ch.parent === featureItem
  );
}

export function planJobs(targets: BehaveHierarchyNode[]): BehaveJob[] {
  const whole = new Map<string, BehaveHierarchyNode>();
  const scenarios = new Map<string, BehaveJob>();

  function addScenarioIfNotWholeFeature(
    feature: BehaveHierarchyNode,
    scenarioItem: BehaveHierarchyNode,
    fp: string
  ): void {
    const key = normalizeFsPath(fp);
    if (!whole.has(key)) {
      scenarios.set(scenarioItem.id, {
        kind: "scenario",
        featureItem: feature,
        scenarioItem,
        scenarioName: scenarioItem.label,
        fsPath: fp
      });
    }
  }

  for (const item of targets) {
    if (item.id.startsWith(FEATURE_PREFIX)) {
      const fp = item.uri?.fsPath;
      if (fp) {
        whole.set(normalizeFsPath(fp), item);
      }
      continue;
    }
    if (item.id.startsWith(SCEN_PREFIX)) {
      const feature = item.parent;
      const fp = feature?.uri?.fsPath;
      if (feature && fp) {
        addScenarioIfNotWholeFeature(feature, item, fp);
      }
      continue;
    }
    if (item.id.includes("::step:")) {
      const suite = item.parent;
      const feature = suite?.parent;
      const fp = feature?.uri?.fsPath;
      if (!suite || !feature || !fp || whole.has(normalizeFsPath(fp))) {
        continue;
      }
      if (suite.id.startsWith(SCEN_PREFIX)) {
        addScenarioIfNotWholeFeature(feature, suite, fp);
      } else if (suite.id.startsWith(BG_PREFIX)) {
        whole.set(normalizeFsPath(fp), feature);
      }
      continue;
    }
    if (item.id.startsWith(BG_PREFIX)) {
      const feature = item.parent;
      const fp = feature?.uri?.fsPath;
      if (feature && fp) {
        whole.set(normalizeFsPath(fp), feature);
      }
    }
  }

  const jobs: BehaveJob[] = [];
  for (const [, featureItem] of whole) {
    jobs.push({
      kind: "feature",
      featureItem,
      fsPath: featureItem.uri.fsPath
    });
  }
  for (const job of scenarios.values()) {
    if (!whole.has(normalizeFsPath(job.fsPath))) {
      jobs.push(job);
    }
  }
  return jobs;
}

function getWorkspaceRootForFile(filePath: string): string {
  const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
  if (folder) {
    return folder.uri.fsPath;
  }
  if (vscode.workspace.workspaceFolders?.[0]) {
    return vscode.workspace.workspaceFolders[0].uri.fsPath;
  }
  return path.dirname(filePath);
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

export async function runBehaveDebugJobs(
  jobs: BehaveJob[],
  token: vscode.CancellationToken
): Promise<void> {
  const runCts = takeOverActiveRunCancellation();
  const parentReg = token.onCancellationRequested(() => runCts.cancel());
  try {
    for (const job of jobs) {
      if (runCts.token.isCancellationRequested) {
        break;
      }
      const workspaceRoot = getWorkspaceRootForFile(job.fsPath);
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        vscode.Uri.file(job.fsPath)
      );
      const resourceUri = vscode.Uri.file(job.fsPath);
      const justMyCode = vscode.workspace
        .getConfiguration("behaveRunner", resourceUri)
        .get<boolean>("debug.justMyCode", true);

      const debugArgs =
        job.kind === "feature"
          ? [job.fsPath]
          : [job.fsPath, "-n", job.scenarioName];

      const debugConfig: vscode.DebugConfiguration = {
        type: "python",
        request: "launch",
        name:
          job.kind === "feature"
            ? "Behave: Feature"
            : `Behave: ${job.scenarioName}`,
        module: "behave",
        args: debugArgs,
        cwd: workspaceRoot,
        console: "integratedTerminal",
        justMyCode
      };

      const started = await vscode.debug.startDebugging(
        workspaceFolder ?? undefined,
        debugConfig
      );
      if (!started) {
        vscode.window.showErrorMessage(
          "Behave Runner: failed to start debugger."
        );
        break;
      }
      await new Promise<void>((resolvePromise) => {
        let settled = false;
        let sub: vscode.Disposable | undefined;
        let cancelReg: vscode.Disposable | undefined;
        const finish = (): void => {
          if (settled) {
            return;
          }
          settled = true;
          sub?.dispose();
          cancelReg?.dispose();
          resolvePromise();
        };
        sub = vscode.debug.onDidTerminateDebugSession(() => {
          finish();
        });
        cancelReg = runCts.token.onCancellationRequested(() => {
          void vscode.debug.stopDebugging();
          finish();
        });
      });
    }
  } finally {
    parentReg.dispose();
    releaseActiveRunCancellation(runCts);
  }
}

function spawnBehave(
  job: BehaveJob,
  cwd: string,
  interpreterPath: string | undefined,
  jsonReportPath: string,
  opts: {
    liveStream: boolean;
    liveFormatterPythonRoot: string | undefined;
  }
): cp.ChildProcessWithoutNullStreams {
  // Behave captures step stdout by default; prints never reach this process or the live NDJSON stream.
  const behaveArgs: string[] = ["--no-capture-stdout", "-f", "json", "-o", jsonReportPath];
  if (opts.liveStream && opts.liveFormatterPythonRoot) {
    // Avoid Behave's plain-text summary on stdout (mixed with NDJSON / step prints).
    behaveArgs.push("--no-summary", "-f", "behave_runner_live:BehaveRunnerLiveFormatter");
  }
  if (job.kind === "feature") {
    behaveArgs.push(job.fsPath);
  } else {
    behaveArgs.push("-n", job.scenarioName, job.fsPath);
  }
  const env = { ...(process.env as NodeJS.ProcessEnv) };
  if (opts.liveStream && opts.liveFormatterPythonRoot) {
    const root = opts.liveFormatterPythonRoot;
    const sep = path.delimiter;
    const prev = env.PYTHONPATH ?? "";
    env.PYTHONPATH = prev ? `${root}${sep}${prev}` : root;
  }
  const spawnOpts: cp.SpawnOptions = {
    cwd,
    env
  };
  if (interpreterPath) {
    return cp.spawn(
      interpreterPath,
      ["-m", "behave", ...behaveArgs],
      spawnOpts
    ) as cp.ChildProcessWithoutNullStreams;
  }
  return cp.spawn("behave", behaveArgs, spawnOpts) as cp.ChildProcessWithoutNullStreams;
}

function liveFormatterBundlePath(extensionPath: string): string {
  return path.join(extensionPath, "media", "python");
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
  /** Live run panel and NDJSON are driven only by this path when the formatter bundle exists. */
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

  try {
    enqueueAndStartScenarioItems(runJob, featureItem);
    jobItemsPrimed = true;

    if (!liveOpts?.skipLivePanelReset) {
      clearLiveRunPanel();
      if (useLiveStream) {
        postLiveRunMessage({ type: "feature", label: featureItem.label });
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

    let pendingLiveStderr = "";
    let attachLiveStderrToStepKey: string | undefined;
    let lastLiveStepScenarioKey = "";

    function livePanelSinkWrap(message: unknown): void {
      if (!isLivePanelMessage(message)) {
        postLiveRunMessage(message);
        return;
      }
      const msgType = message.type;
      if (msgType === "feature" || msgType === "scenario") {
        pendingLiveStderr = "";
        attachLiveStderrToStepKey = undefined;
      } else if (msgType === "step") {
        lastLiveStepScenarioKey = String(message.scenarioKey ?? "");
        const st = String(message.status ?? "").toLowerCase();
        const failed = st === "failed" || st === "error";
        if (failed) {
          const pend = pendingLiveStderr;
          pendingLiveStderr = "";
          if (pend.trim()) {
            const lt = String(message.logText ?? "");
            const sep = lt.length > 0 && !lt.endsWith("\n") ? "\n" : "";
            message.logText = lt + sep + pend;
            const er = message.error;
            message.error = er ? `${String(er)}\n\n${pend}` : pend;
          }
          attachLiveStderrToStepKey =
            typeof message.stepKey === "string" && message.stepKey.length > 0
              ? message.stepKey
              : undefined;
        } else {
          attachLiveStderrToStepKey = undefined;
          pendingLiveStderr = "";
        }
      }
      postLiveRunMessage(message);
    }

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

async function runBehaveJobs(
  jobs: BehaveJob[],
  token: vscode.CancellationToken,
  extensionPath: string
): Promise<void> {
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
  }
}

export async function runBehaveHierarchySelection(
  items: BehaveHierarchyNode[],
  token: vscode.CancellationToken
): Promise<void> {
  await revealLiveRunPanel();
  await runBehaveJobs(
    planJobs(items),
    token,
    behaveRunnerExtensionPath
  );
}

export async function runBehaveHierarchyDebugSelection(
  items: BehaveHierarchyNode[],
  token: vscode.CancellationToken
): Promise<void> {
  await revealLiveRunPanel();
  await runBehaveDebugJobs(planJobs(items), token);
}

export function getBehaveRunnerExtensionPath(): string {
  return behaveRunnerExtensionPath;
}

export function registerBehaveOutputChannel(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(getBehaveOutputChannel());
}

/** Resolve a feature from the store, expand children, return scenario at `scenarioLine` (0-based). */
export async function getFeatureHierarchyNodeForPath(
  store: BehaveHierarchyStore,
  fsPath: string
): Promise<BehaveHierarchyNode | undefined> {
  let feature = store.getFeatureByFsPath(fsPath);
  if (!feature) {
    await store.discoverFeatureFiles();
    feature = store.getFeatureByFsPath(fsPath);
  }
  return feature;
}

export async function getScenarioNodeAtLine(
  store: BehaveHierarchyStore,
  fsPath: string,
  scenarioLine: number
): Promise<BehaveHierarchyNode | undefined> {
  const feature = await getFeatureHierarchyNodeForPath(store, fsPath);
  if (!feature) {
    return undefined;
  }
  await resolveBehaveFeatureChildrenIfNeeded(feature);
  const id =
    SCEN_PREFIX + encodeURIComponent(fsPath) + ":" + String(scenarioLine);
  return feature.children.get(id);
}

/** All tree scenario nodes for rows of one Scenario Outline (by outline header line, 0-based). */
export async function getScenarioOutlineExpansionNodes(
  store: BehaveHierarchyStore,
  fsPath: string,
  outlineHeaderLine0: number
): Promise<BehaveHierarchyNode[]> {
  const feature = await getFeatureHierarchyNodeForPath(store, fsPath);
  if (!feature) {
    return [];
  }
  await resolveBehaveFeatureChildrenIfNeeded(feature);
  return listOutlineExpansionsForHeader(feature, outlineHeaderLine0);
}
