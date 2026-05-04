import * as vscode from "vscode";
import type { BehaveHierarchyNode } from "./behaveHierarchyModel";
import type { BehaveTreeStatus } from "./behaveRunState";
import {
  findBgItem,
  findScenarioItem,
  findStepUnderParent,
  normalizeScenarioName,
  parseBehaveLocation,
  pathsEqualFs
} from "./behaveJsonReport";

export type LiveStreamJob =
  | { kind: "feature" }
  | {
      kind: "scenario";
      scenarioName: string;
      scenarioItem: BehaveHierarchyNode;
    };

export type LiveStreamEvent =
  | {
      event: "scenario_started";
      feature?: string;
      scenario?: string;
      location?: string;
    }
  | {
      event: "step_finished";
      feature?: string;
      scenario?: string;
      location?: string;
      keyword?: string;
      step?: string;
      status?: string;
      error?: string | null;
    };

function chunkForTestOutput(text: string): string {
  const normalized = text.includes("\r\n") ? text : text.replace(/\n/g, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : normalized + "\r\n";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function parseLiveStreamLine(jsonLine: string): LiveStreamEvent | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonLine) as unknown;
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  const ev = parsed.event;
  if (ev === "scenario_started") {
    return {
      event: "scenario_started",
      feature: typeof parsed.feature === "string" ? parsed.feature : undefined,
      scenario: typeof parsed.scenario === "string" ? parsed.scenario : undefined,
      location: typeof parsed.location === "string" ? parsed.location : undefined
    };
  }
  if (ev === "step_finished") {
    return {
      event: "step_finished",
      feature: typeof parsed.feature === "string" ? parsed.feature : undefined,
      scenario: typeof parsed.scenario === "string" ? parsed.scenario : undefined,
      location: typeof parsed.location === "string" ? parsed.location : undefined,
      keyword: typeof parsed.keyword === "string" ? parsed.keyword : undefined,
      step: typeof parsed.step === "string" ? parsed.step : undefined,
      status: typeof parsed.status === "string" ? parsed.status : undefined,
      error:
        parsed.error == null
          ? undefined
          : typeof parsed.error === "string"
            ? parsed.error
            : String(parsed.error)
    };
  }
  return undefined;
}

/** Behave step status name when no Python step matches (not JavaScript `undefined`). */
function statusLabelForLog(rawLower: string): string {
  if (rawLower === "undefined") {
    return "no step definition";
  }
  return rawLower;
}

export class NdjsonStdoutBuffer {
  private remainder = "";

  /** Returns complete lines (without trailing \\n). */
  consumeChunk(chunk: string): string[] {
    this.remainder += chunk;
    const parts = this.remainder.split(/\r?\n/);
    this.remainder = parts.pop() ?? "";
    return parts.filter((p) => p.length > 0);
  }

  flushLine(): string | undefined {
    const t = this.remainder.trim();
    this.remainder = "";
    return t.length > 0 ? t : undefined;
  }
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

export type LiveStreamSink = (message: unknown) => void;

export function liveStreamStatusToTreeStatus(status: string): BehaveTreeStatus {
  const s = status.toLowerCase();
  if (s === "failed" || s === "error") {
    return "failed";
  }
  // Behave names this status "undefined" when no matching step definition exists (run stops with error).
  if (s === "undefined") {
    return "failed";
  }
  if (s === "skipped") {
    return "skipped";
  }
  if (s === "passed" || s === "pending") {
    return "passed";
  }
  return "skipped";
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
    onStepTreeStatus?: (
      stepItem: BehaveHierarchyNode | undefined,
      rawStatus: string
    ) => void;
    /** Plain stdout lines (e.g. print) before the next NDJSON step_finished; consumed once per step. */
    consumePendingStdout?: () => string;
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
    if (!scenarioItem) {
      return;
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
    ctx.onStepTreeStatus?.(scenarioItem, "running");
    return;
  }

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
  const rawStatus = (event.status ?? "unknown").toLowerCase();
  const statusForTree = rawStatus === "undefined" ? "failed" : rawStatus;
  const statusForLog = statusLabelForLog(rawStatus);
  const locVs = locationForBehaveStep(
    event.location,
    uri,
    ctx.fsPath,
    ctx.workspaceRoot
  );

  const stdoutBuf = ctx.consumePendingStdout?.() ?? "";
  const stdoutPrefix =
    stdoutBuf.trim().length > 0
      ? stdoutBuf + (stdoutBuf.endsWith("\n") ? "" : "\n")
      : "";
  if (stdoutPrefix) {
    ctx.appendOutput(chunkForTestOutput(stdoutPrefix), outputAnchor, locVs);
  }
  ctx.appendOutput(`${kw} ${stepText} ... ${statusForLog}\r\n`, outputAnchor, locVs);

  const err = event.error?.trim();
  if (err) {
    ctx.appendOutput(chunkForTestOutput(err), outputAnchor, locVs);
  }

  ctx.onStepTreeStatus?.(stepItem, statusForTree);

  const scenarioKeyForStep =
    stepItem?.parent?.id ?? scenarioItem?.id ?? "__orphan__";
  const stepKey =
    stepItem?.id ??
    `anon:${ctx.fsPath}:${encodeURIComponent(
      event.scenario ?? ""
    )}:${event.location ?? ""}:${kw}:${stepText}`;
  const logHeadline = `${kw} ${stepText} ... ${statusForLog}\n`;
  const logHeadlineForPanel = stdoutPrefix + logHeadline;
  let logText = logHeadlineForPanel;
  if (err) {
    logText += err + (err.endsWith("\n") ? "" : "\n");
  }

  ctx.livePanelSink?.({
    type: "step",
    scenarioKey: scenarioKeyForStep,
    stepKey,
    scenario: event.scenario ?? "",
    keyword: kw,
    text: stepText,
    status: statusForTree,
    error: err || undefined,
    logHeadline: logHeadlineForPanel,
    logText
  });
}
