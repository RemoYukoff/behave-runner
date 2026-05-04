import * as path from "path";
import * as vscode from "vscode";
import {
  BG_PREFIX,
  type BehaveHierarchyNode,
  SCEN_PREFIX
} from "./behaveHierarchyModel";

export type BehaveJsonApplyJob = {
  kind: "feature" | "scenario";
  fsPath: string;
  scenarioName?: string;
  /** When `kind === "scenario"`, matches the primed node for finalize-only logic. */
  scenarioItemId?: string;
  /** Behave cwd; JSON locations are often relative to this. */
  workspaceRoot: string;
};

function normalizeFsPath(p: string): string {
  return path.normalize(p).replace(/\\/g, "/").toLowerCase();
}

function pathsEqual(a: string, b: string): boolean {
  return normalizeFsPath(a) === normalizeFsPath(b);
}

function resolveToAbsoluteFsPath(filePath: string, cwd: string): string {
  const trimmed = filePath.trim();
  if (!trimmed) {
    return trimmed;
  }
  const norm = path.normalize(trimmed.replace(/\\/g, path.sep));
  if (path.isAbsolute(norm)) {
    return norm;
  }
  return path.normalize(path.resolve(cwd, norm));
}

/** Compare paths where either side may be relative (Behave JSON) vs absolute (VS Code). */
export function pathsEqualFs(a: string, b: string, cwd: string): boolean {
  try {
    return (
      normalizeFsPath(resolveToAbsoluteFsPath(a, cwd)) ===
      normalizeFsPath(resolveToAbsoluteFsPath(b, cwd))
    );
  } catch {
    return false;
  }
}

export function normalizeScenarioName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function stripOutlineSuffix(name: string): string {
  const idx = name.indexOf(" -- @");
  if (idx >= 0) {
    return name.slice(0, idx).trim();
  }
  return name.trim();
}

/** Behave `location` strings use 1-based line numbers (e.g. `features/a.feature:3`). */
export function parseBehaveLocation(
  loc: string | undefined
): { filePath: string; line1Based: number } | null {
  if (!loc || typeof loc !== "string") {
    return null;
  }
  const m = loc.trim().match(/^(.+):(\d+)$/);
  if (!m) {
    return null;
  }
  const line = parseInt(m[2], 10);
  if (!Number.isFinite(line)) {
    return null;
  }
  return { filePath: path.normalize(m[1]), line1Based: line };
}

/** 0-based line in `behave:scen:<encPath>:<line>` ids (Examples row or scenario keyword line). */
function scenarioAnchorLine0FromId(ch: BehaveHierarchyNode): number | undefined {
  if (!ch.id.startsWith(SCEN_PREFIX)) {
    return undefined;
  }
  const rest = ch.id.slice(SCEN_PREFIX.length);
  const lastColon = rest.lastIndexOf(":");
  if (lastColon < 0) {
    return undefined;
  }
  const lineStr = rest.slice(lastColon + 1);
  const sl = parseInt(lineStr, 10);
  return Number.isFinite(sl) ? sl : undefined;
}

function disambiguateScenariosByLocation(
  candidates: BehaveHierarchyNode[],
  locationStr: string | undefined,
  jobFsPath: string,
  workspaceRoot: string
): BehaveHierarchyNode | undefined {
  const loc = parseBehaveLocation(locationStr);
  if (!loc || !pathsEqualFs(loc.filePath, jobFsPath, workspaceRoot)) {
    return undefined;
  }
  const line0 = loc.line1Based - 1;
  const byIdLine = candidates.filter(
    (ch) => scenarioAnchorLine0FromId(ch) === line0
  );
  if (byIdLine.length === 1) {
    return byIdLine[0];
  }
  const byRange = candidates.filter((ch) => ch.range?.start.line === line0);
  if (byRange.length === 1) {
    return byRange[0];
  }
  return undefined;
}

function featurePathFromJson(feature: Record<string, unknown>): string | null {
  const loc = parseBehaveLocation(feature.location as string | undefined);
  return loc?.filePath ?? null;
}

/** 0-based line from ids shaped like `...::step:0:L42` */
function lineFromEncodedStepId(id: string): number | undefined {
  const m = id.match(/::step:\d+:L(\d+)$/);
  if (!m) {
    return undefined;
  }
  const line = parseInt(m[1], 10);
  return Number.isFinite(line) ? line : undefined;
}

function locationForStepItem(
  stepItem: BehaveHierarchyNode
): vscode.Location | undefined {
  const uri = stepItem.uri;
  if (!uri) {
    return undefined;
  }
  const line = lineFromEncodedStepId(stepItem.id);
  if (line === undefined) {
    return undefined;
  }
  return new vscode.Location(uri, new vscode.Position(line, 0));
}

export function findBgItem(
  featureItem: BehaveHierarchyNode
): BehaveHierarchyNode | undefined {
  for (const ch of featureItem.children.values()) {
    if (ch.id.startsWith(BG_PREFIX)) {
      return ch;
    }
  }
  return undefined;
}

export function findStepUnderParent(
  parent: BehaveHierarchyNode,
  jobFsPath: string,
  line0Based: number,
  workspaceRoot: string
): BehaveHierarchyNode | undefined {
  for (const step of parent.children.values()) {
    if (!step.id.includes("::step:")) {
      continue;
    }
    const uri = step.uri;
    if (!uri || !pathsEqualFs(uri.fsPath, jobFsPath, workspaceRoot)) {
      continue;
    }
    if (lineFromEncodedStepId(step.id) === line0Based) {
      return step;
    }
  }
  return undefined;
}

export function findScenarioItem(
  featureItem: BehaveHierarchyNode,
  elementName: string,
  locationStr: string | undefined,
  jobFsPath: string,
  workspaceRoot: string
): BehaveHierarchyNode | undefined {
  const normEl = normalizeScenarioName(elementName);
  const scenChildren: BehaveHierarchyNode[] = [];
  for (const ch of featureItem.children.values()) {
    if (ch.id.startsWith(SCEN_PREFIX)) {
      scenChildren.push(ch);
    }
  }

  const nameMatches = scenChildren.filter(
    (ch) => normalizeScenarioName(ch.label) === normEl
  );
  if (nameMatches.length === 1) {
    return nameMatches[0];
  }
  if (nameMatches.length > 1) {
    const pick = disambiguateScenariosByLocation(
      nameMatches,
      locationStr,
      jobFsPath,
      workspaceRoot
    );
    if (pick) {
      return pick;
    }
  }

  const loc = parseBehaveLocation(locationStr);
  if (loc && pathsEqualFs(loc.filePath, jobFsPath, workspaceRoot)) {
    const line0 = loc.line1Based - 1;
    for (const ch of scenChildren) {
      const rest = ch.id.slice(SCEN_PREFIX.length);
      const lastColon = rest.lastIndexOf(":");
      const encPath = rest.slice(0, lastColon);
      const lineStr = rest.slice(lastColon + 1);
      const sl = parseInt(lineStr, 10);
      try {
        const fp = decodeURIComponent(encPath);
        if (pathsEqual(fp, jobFsPath) && sl === line0) {
          return ch;
        }
      } catch {
        /* ignore */
      }
    }
  }

  const wantStrip = normalizeScenarioName(stripOutlineSuffix(elementName));
  const stripMatches = scenChildren.filter(
    (ch) => normalizeScenarioName(stripOutlineSuffix(ch.label)) === wantStrip
  );
  if (stripMatches.length === 1) {
    return stripMatches[0];
  }
  if (stripMatches.length > 1) {
    const pick = disambiguateScenariosByLocation(
      stripMatches,
      locationStr,
      jobFsPath,
      workspaceRoot
    );
    if (pick) {
      return pick;
    }
  }
  return undefined;
}

function normalizeErrorMessage(msg: unknown): string | undefined {
  if (msg == null) {
    return undefined;
  }
  if (Array.isArray(msg)) {
    return msg.map(String).join("\n");
  }
  return String(msg);
}

export type BehaveTreeStepOutcome = "passed" | "failed" | "skipped";

/** Behave JSON uses `failed`; some outcomes (e.g. hooks/assertions) report as `error`. */
function isStepFailureStatus(status: string): boolean {
  return status === "failed" || status === "error";
}

function jsonStepStatusToTreeOutcome(status: string): BehaveTreeStepOutcome {
  const s = status.toLowerCase();
  if (isStepFailureStatus(s)) {
    return "failed";
  }
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

function errorDetailsFromResult(
  result: Record<string, unknown> | undefined
): string | undefined {
  if (!result) {
    return undefined;
  }
  const primary =
    normalizeErrorMessage(result.error_message) ??
    normalizeErrorMessage(result.exception) ??
    normalizeErrorMessage(result.traceback);
  if (primary?.trim()) {
    return primary.trim();
  }
  const exc = result.exception;
  if (isRecord(exc)) {
    const nested =
      normalizeErrorMessage(exc.message) ??
      normalizeErrorMessage(exc.value) ??
      normalizeErrorMessage(exc.traceback);
    if (nested?.trim()) {
      return nested.trim();
    }
  }
  return undefined;
}

/** Match TestRun.appendOutput expectations (CRLF). */
function chunkForTestOutput(text: string): string {
  const normalized = text.includes("\r\n") ? text : text.replace(/\n/g, "\r\n");
  return normalized.endsWith("\r\n") ? normalized : normalized + "\r\n";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Scenarios primed for this job but absent from Behave JSON — mark failed so the UI does not hang. */
function finalizeIncompleteScenarios(
  featureItem: BehaveHierarchyNode,
  job: BehaveJsonApplyJob,
  completedScenarioIds: Set<string>,
  appendOutput: (
    text: string,
    test?: BehaveHierarchyNode,
    location?: vscode.Location
  ) => void,
  onScenarioOutcome?: (
    scenarioItem: BehaveHierarchyNode,
    outcome: "passed" | "failed"
  ) => void
): void {
  const msgText = "Behave did not return results for this scenario.";
  for (const ch of featureItem.children.values()) {
    if (!ch.id.startsWith(SCEN_PREFIX)) {
      continue;
    }
    if (job.kind === "scenario") {
      if (job.scenarioItemId) {
        if (ch.id !== job.scenarioItemId) {
          continue;
        }
      } else if (job.scenarioName) {
        if (
          normalizeScenarioName(ch.label) !==
          normalizeScenarioName(job.scenarioName)
        ) {
          continue;
        }
      }
    }
    if (completedScenarioIds.has(ch.id)) {
      continue;
    }
    appendOutput(`${msgText}\r\n`, ch);
    onScenarioOutcome?.(ch, "failed");
  }
}

export type BehaveJsonApplyResult = {
  /** False when JSON could not be parsed or contained no block for this feature file. */
  applied: boolean;
  featureHasFailure: boolean;
};

export type BehaveJsonApplyOptions = {
  /** If true, only updates pass/fail; skip echoing scenario/background/step lines (live stream already did). */
  omitPrintedOutput?: boolean;
  onStepOutcome?: (
    stepItem: BehaveHierarchyNode,
    outcome: BehaveTreeStepOutcome
  ) => void;
  onScenarioOutcome?: (
    scenarioItem: BehaveHierarchyNode,
    outcome: "passed" | "failed"
  ) => void;
};

/**
 * Applies Behave's `json` formatter output: tree state via callbacks; optional echoed lines via `appendOutput`.
 */
export function applyBehaveJsonReport(
  featureItem: BehaveHierarchyNode,
  job: BehaveJsonApplyJob,
  jsonText: string,
  appendOutput: (
    text: string,
    test?: BehaveHierarchyNode,
    location?: vscode.Location
  ) => void,
  options?: BehaveJsonApplyOptions
): BehaveJsonApplyResult {
  const omitEcho = options?.omitPrintedOutput === true;
  const onStep = options?.onStepOutcome;
  const onScenario = options?.onScenarioOutcome;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    appendOutput("[Behave Runner] Invalid JSON report from Behave.\r\n");
    return { applied: false, featureHasFailure: true };
  }

  if (!Array.isArray(parsed)) {
    appendOutput("[Behave Runner] Behave JSON report was not an array.\r\n");
    return { applied: false, featureHasFailure: true };
  }

  let featureHasFailure = false;
  let matchedJobFeature = false;

  for (const rawFeature of parsed) {
    if (!isRecord(rawFeature)) {
      continue;
    }

    const fpJson = featurePathFromJson(rawFeature);
    if (!fpJson || !pathsEqualFs(fpJson, job.fsPath, job.workspaceRoot)) {
      continue;
    }

    const elements = rawFeature.elements;
    if (!Array.isArray(elements) || elements.length === 0) {
      continue;
    }

    matchedJobFeature = true;

    let bgStepLines = "";
    let bgFailed = false;
    const completedScenarioIds = new Set<string>();

    for (const rawEl of elements) {
      if (!isRecord(rawEl)) {
        continue;
      }

      const elType =
        typeof rawEl.type === "string" ? rawEl.type.toLowerCase() : "";

      if (elType === "background") {
        const bgItem = findBgItem(featureItem);
        const steps = rawEl.steps;
        if (!bgItem || !Array.isArray(steps)) {
          continue;
        }

        bgStepLines = "";
        bgFailed = false;
        for (const rawStep of steps) {
          if (!isRecord(rawStep)) {
            continue;
          }
          const loc = parseBehaveLocation(rawStep.location as string | undefined);
          if (!loc || !pathsEqualFs(loc.filePath, job.fsPath, job.workspaceRoot)) {
            continue;
          }
          const line0 = loc.line1Based - 1;
          const stepItem = findStepUnderParent(
            bgItem,
            job.fsPath,
            line0,
            job.workspaceRoot
          );
          if (!stepItem) {
            continue;
          }
          const result = isRecord(rawStep.result) ? rawStep.result : undefined;
          const status =
            typeof result?.status === "string"
              ? result.status.toLowerCase()
              : "untested";
          const durationSec =
            typeof result?.duration === "number" ? result.duration : 0;
          const durationMs = Math.round(durationSec * 1000);
          bgStepLines += `${rawStep.keyword} ${rawStep.name} ... ${status} (${durationMs}ms)\r\n`;
          onStep?.(stepItem, jsonStepStatusToTreeOutcome(status));
          if (isStepFailureStatus(status)) {
            bgFailed = true;
            featureHasFailure = true;
            const errRaw = errorDetailsFromResult(result);
            const msgText = errRaw ?? "Step failed";
            bgStepLines += chunkForTestOutput(msgText);
          }
        }
        continue;
      }

      const scenarioName =
        typeof rawEl.name === "string" ? rawEl.name : "(scenario)";
      const scenarioItem = findScenarioItem(
        featureItem,
        scenarioName,
        rawEl.location as string | undefined,
        job.fsPath,
        job.workspaceRoot
      );

      if (!scenarioItem) {
        continue;
      }

      if (job.kind === "scenario") {
        if (job.scenarioItemId) {
          if (scenarioItem.id !== job.scenarioItemId) {
            continue;
          }
        } else if (job.scenarioName) {
          if (
            normalizeScenarioName(job.scenarioName) !==
            normalizeScenarioName(scenarioName)
          ) {
            continue;
          }
        }
      }

      if (!omitEcho) {
        appendOutput(`Scenario: ${scenarioName}\r\n`, scenarioItem);

        if (bgStepLines.length > 0) {
          appendOutput("Background:\r\n", scenarioItem);
          appendOutput(bgStepLines, scenarioItem);
        }
      }

      const steps = rawEl.steps;
      if (!Array.isArray(steps)) {
        continue;
      }

      let scenarioFailed = bgFailed;
      for (const rawStep of steps) {
        if (!isRecord(rawStep)) {
          continue;
        }
        const loc = parseBehaveLocation(rawStep.location as string | undefined);
        if (!loc || !pathsEqualFs(loc.filePath, job.fsPath, job.workspaceRoot)) {
          continue;
        }
        const line0 = loc.line1Based - 1;
        const stepItem = findStepUnderParent(
          scenarioItem,
          job.fsPath,
          line0,
          job.workspaceRoot
        );
        if (!stepItem) {
          continue;
        }

        const result = isRecord(rawStep.result) ? rawStep.result : undefined;
        const status =
          typeof result?.status === "string"
            ? result.status.toLowerCase()
            : "untested";
        const durationSec =
          typeof result?.duration === "number" ? result.duration : 0;
        const durationMs = Math.round(durationSec * 1000);

        const locVs = locationForStepItem(stepItem);
        if (!omitEcho) {
          appendOutput(
            `${rawStep.keyword} ${rawStep.name} ... ${status} (${durationMs}ms)\r\n`,
            scenarioItem,
            locVs
          );
        }

        onStep?.(stepItem, jsonStepStatusToTreeOutcome(status));
        if (isStepFailureStatus(status)) {
          scenarioFailed = true;
          featureHasFailure = true;
          const errRaw = errorDetailsFromResult(result);
          const msgText = errRaw ?? "Step failed";
          if (!omitEcho) {
            appendOutput(chunkForTestOutput(msgText), scenarioItem, locVs);
          }
        }
      }

      const elStatus =
        typeof rawEl.status === "string"
          ? rawEl.status.toLowerCase()
          : undefined;
      if (scenarioFailed || elStatus === "failed") {
        onScenario?.(scenarioItem, "failed");
      } else {
        onScenario?.(scenarioItem, "passed");
      }
      completedScenarioIds.add(scenarioItem.id);
    }

    finalizeIncompleteScenarios(
      featureItem,
      job,
      completedScenarioIds,
      appendOutput,
      onScenario
    );

    const featStatus =
      typeof rawFeature.status === "string"
        ? rawFeature.status.toLowerCase()
        : undefined;
    if (featStatus === "failed") {
      featureHasFailure = true;
    }
  }

  return { applied: matchedJobFeature, featureHasFailure };
}
