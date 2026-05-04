/** Last-known outcome for Behave hierarchy TreeView (by hierarchy node id). */

export type BehaveTreeStatus =
  | "idle"
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

const statusByTestId = new Map<string, BehaveTreeStatus>();

let refreshHierarchy: (() => void) | undefined;

export function setBehaveHierarchyRefresh(fn: (() => void) | undefined): void {
  refreshHierarchy = fn;
}

export function refreshBehaveHierarchy(): void {
  refreshHierarchy?.();
}

export function clearBehaveRunState(): void {
  statusByTestId.clear();
  refreshHierarchy?.();
}

export function setBehaveTreeStatus(id: string, status: BehaveTreeStatus): void {
  statusByTestId.set(id, status);
  refreshHierarchy?.();
}

export function getBehaveTreeStatus(id: string): BehaveTreeStatus {
  return statusByTestId.get(id) ?? "idle";
}
