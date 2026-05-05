import * as vscode from "vscode";
import type { BehaveHierarchyNode } from "./behaveHierarchyModel";
import {
  findBgItem,
  findScenarioItem,
  findStepUnderParent
} from "./behaveLiveStreamLookup";
import {
  normalizeScenarioName,
  parseBehaveLocation,
  pathsEqualFs
} from "./behaveLiveStreamPaths";
import { normalizeToCrlfChunk } from "./text/normalizeCrlf";
import type { LivePanelToWebviewMessage } from "./ui/livePanelProtocol";
import type { LiveStreamEvent, LiveStreamJob } from "./behaveLiveStreamTypes";

/** Behave step status name when no Python step matches (not JavaScript `undefined`). */
function statusLabelForLog(rawLower: string): string {
  if (rawLower === "undefined") {
    return "no step definition";
  }
  return rawLower;
}

function locationForBehaveStep(
  locationStr: string | undefined,
  featureUri: vscode.Uri,
  jobFsPath: string,
  workspaceRoot: string
): vscode.Location | undefined {
  const loc = parseBehaveLocation(locationStr);
  if (!loc || !pathsEqualFs(loc.filePath, jobFsPath, workspaceRoot)) {
    return undefined;
  }
  return new vscode.Location(
    featureUri,
    new vscode.Position(loc.line1Based - 1, 0)
  );
}

function resolveScenarioItem(
  featureItem: BehaveHierarchyNode,
  job: LiveStreamJob,
  scenarioName: string | undefined,
  locationStr: string | undefined,
  fsPath: string,
  workspaceRoot: string
): BehaveHierarchyNode | undefined {
  if (!scenarioName) {
    return undefined;
  }
  if (job.kind === "scenario") {
    if (
      normalizeScenarioName(job.scenarioName) !==
      normalizeScenarioName(scenarioName ?? "")
    ) {
      return undefined;
    }
    return job.scenarioItem;
  }
  return findScenarioItem(
    featureItem,
    scenarioName,
    locationStr,
    fsPath,
    workspaceRoot
  );
}

type StepStreamFields = {
  scenario?: string;
  location?: string;
  keyword?: string;
  step?: string;
};

function resolveStepDispatchBase(
  ctx: {
    featureItem: BehaveHierarchyNode;
    job: LiveStreamJob;
    fsPath: string;
    workspaceRoot: string;
  },
  event: StepStreamFields,
  uri: vscode.Uri
): {
  scenarioItem: BehaveHierarchyNode | undefined;
  stepItem: BehaveHierarchyNode | undefined;
  outputAnchor: BehaveHierarchyNode;
  kw: string;
  stepText: string;
  scenarioKeyForStep: string;
  stepKey: string;
  locVs: vscode.Location | undefined;
} {
  const scenarioItem = resolveScenarioItem(
    ctx.featureItem,
    ctx.job,
    event.scenario,
    event.location,
    ctx.fsPath,
    ctx.workspaceRoot
  );
  const bgItem = findBgItem(ctx.featureItem);

  const locParsed = parseBehaveLocation(event.location);
  let stepItem: BehaveHierarchyNode | undefined;
  if (locParsed && pathsEqualFs(locParsed.filePath, ctx.fsPath, ctx.workspaceRoot)) {
    const line0 = locParsed.line1Based - 1;
    if (scenarioItem) {
      stepItem = findStepUnderParent(
        scenarioItem,
        ctx.fsPath,
        line0,
        ctx.workspaceRoot
      );
    }
    if (!stepItem && bgItem) {
      stepItem = findStepUnderParent(
        bgItem,
        ctx.fsPath,
        line0,
        ctx.workspaceRoot
      );
    }
  }

  const outputAnchor =
    scenarioItem ??
    (stepItem?.parent?.id.startsWith("behave:bg:") ? bgItem : undefined) ??
    bgItem ??
    ctx.featureItem;

  const kw = event.keyword ?? "";
  const stepText = event.step ?? "";
  const scenarioKeyForStep =
    stepItem?.parent?.id ?? scenarioItem?.id ?? "__orphan__";
  const stepKey =
    stepItem?.id ??
    `anon:${ctx.fsPath}:${encodeURIComponent(
      event.scenario ?? ""
    )}:${event.location ?? ""}:${kw}:${stepText}`;
  const locVs = locationForBehaveStep(
    event.location,
    uri,
    ctx.fsPath,
    ctx.workspaceRoot
  );

  return {
    scenarioItem,
    stepItem,
    outputAnchor,
    kw,
    stepText,
    scenarioKeyForStep,
    stepKey,
    locVs
  };
}

function stepGotoPayload(
  loc: vscode.Location | undefined
): Partial<{ gotoPath: string; gotoLine: number }> {
  if (!loc) {
    return {};
  }
  return { gotoPath: loc.uri.fsPath, gotoLine: loc.range.start.line };
}

export type LiveStreamSink = (message: LivePanelToWebviewMessage) => void;

/** Updated as scenarios start; used to attach trailing hook stdout after the last scenario. */
export type LiveRunHookFlushState = {
  lastScenarioKey?: string;
};

type HookFlushCtx = {
  livePanelSink?: LiveStreamSink;
  consumePendingStdout?: () => string;
};

/** Flush stdout captured between NDJSON events (hooks, prints) into the live panel. */
export function flushPendingHookStdout(
  ctx: HookFlushCtx,
  opts?: { scenarioKey?: string }
): void {
  const raw = ctx.consumePendingStdout?.() ?? "";
  if (!raw.trim()) {
    return;
  }
  const t = raw.replace(/\r\n/g, "\n");
  const chunk = t.endsWith("\n") ? t : `${t}\n`;
  ctx.livePanelSink?.({
    type: "hook_stdout",
    text: normalizeToCrlfChunk(chunk),
    scenarioKey: opts?.scenarioKey
  });
}

export function dispatchLiveStreamEvent(
  event: LiveStreamEvent,
  ctx: {
    featureItem: BehaveHierarchyNode;
    job: LiveStreamJob;
    fsPath: string;
    workspaceRoot: string;
    appendOutput: (
      text: string,
      test?: BehaveHierarchyNode,
      location?: vscode.Location
    ) => void;
    livePanelSink?: LiveStreamSink;
    /** Plain stdout lines before the next NDJSON step_finished (mirrored already to the Output channel); consumed for the live panel / structured Test Results lines. */
    consumePendingStdout?: () => string;
    hookFlushState?: LiveRunHookFlushState;
  }
): void {
  const uri = ctx.featureItem.uri;

  if (event.event === "scenario_started") {
    const scenarioItem = resolveScenarioItem(
      ctx.featureItem,
      ctx.job,
      event.scenario,
      event.location,
      ctx.fsPath,
      ctx.workspaceRoot
    );
    flushPendingHookStdout(ctx, {
      scenarioKey: scenarioItem?.id
    });
    if (!scenarioItem) {
      return;
    }
    if (ctx.hookFlushState) {
      ctx.hookFlushState.lastScenarioKey = scenarioItem.id;
    }
    const label = event.scenario ?? "(scenario)";
    ctx.appendOutput(`━━ ${label} ━━\r\n`, scenarioItem);
    const logLine = `━━ ${label} ━━\n`;
    ctx.livePanelSink?.({
      type: "scenario",
      name: label,
      key: scenarioItem.id,
      logLine
    });
    return;
  }

  if (event.event === "step_started") {
    const b = resolveStepDispatchBase(ctx, event, uri);
    ctx.livePanelSink?.({
      type: "step_started",
      scenarioKey: b.scenarioKeyForStep,
      stepKey: b.stepKey,
      scenario: event.scenario ?? "",
      keyword: b.kw,
      text: b.stepText,
      ...stepGotoPayload(b.locVs)
    });
    return;
  }

  if (event.event === "scenario_finished") {
    const scenarioItem = resolveScenarioItem(
      ctx.featureItem,
      ctx.job,
      event.scenario,
      event.location,
      ctx.fsPath,
      ctx.workspaceRoot
    );
    if (!scenarioItem) {
      return;
    }
    ctx.livePanelSink?.({
      type: "scenario_finished",
      key: scenarioItem.id,
      status: event.status
    });
    return;
  }

  if (event.event === "feature_finished") {
    flushPendingHookStdout(ctx, {
      scenarioKey: ctx.hookFlushState?.lastScenarioKey
    });
    ctx.livePanelSink?.({
      type: "feature_finished",
      status: event.status
    });
    return;
  }

  if (event.event !== "step_finished") {
    return;
  }

  const b = resolveStepDispatchBase(ctx, event, uri);
  const rawStatus = (event.status ?? "unknown").toLowerCase();
  const statusForTree = rawStatus === "undefined" ? "failed" : rawStatus;
  const statusForLog = statusLabelForLog(rawStatus);

  const stdoutBuf = ctx.consumePendingStdout?.() ?? "";
  const stdoutPrefix =
    stdoutBuf.trim().length > 0
      ? stdoutBuf + (stdoutBuf.endsWith("\n") ? "" : "\n")
      : "";
  ctx.appendOutput(
    `${b.kw} ${b.stepText} ... ${statusForLog}\r\n`,
    b.outputAnchor,
    b.locVs
  );

  const err = event.error?.trim();
  if (err) {
    ctx.appendOutput(normalizeToCrlfChunk(err), b.outputAnchor, b.locVs);
  }

  const logHeadline = `${b.kw} ${b.stepText} ... ${statusForLog}\n`;
  const logHeadlineForPanel = stdoutPrefix + logHeadline;
  let logText = logHeadlineForPanel;
  if (err) {
    logText += err + (err.endsWith("\n") ? "" : "\n");
  }

  ctx.livePanelSink?.({
    type: "step",
    scenarioKey: b.scenarioKeyForStep,
    stepKey: b.stepKey,
    scenario: event.scenario ?? "",
    keyword: b.kw,
    text: b.stepText,
    status: statusForTree,
    error: err || undefined,
    logHeadline: logHeadlineForPanel,
    logText,
    ...stepGotoPayload(b.locVs)
  });
}
