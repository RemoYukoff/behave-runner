import * as vscode from "vscode";
import type { BehaveHierarchyStore } from "./behaveHierarchyModel";
import type { LivePanelToWebviewMessage } from "./ui/livePanelProtocol";

/** Resolved once in `activate`; avoids scattered module singletons. */
export interface BehaveRunnerServices {
  readonly extensionUri: vscode.Uri;
  readonly extensionPath: string;
  readonly hierarchyStore: BehaveHierarchyStore;
}

let services: BehaveRunnerServices | undefined;

export function setBehaveRunnerServices(
  next: BehaveRunnerServices | undefined
): void {
  services = next;
}

export function getBehaveRunnerServices(): BehaveRunnerServices | undefined {
  return services;
}

export function getBehaveRunnerExtensionPath(): string {
  return services?.extensionPath ?? "";
}

export function getBehaveHierarchyStoreRef():
  | BehaveHierarchyStore
  | undefined {
  return services?.hierarchyStore;
}

export interface LiveRunPanelGateway {
  post(message: LivePanelToWebviewMessage): void;
  clear(): void;
  persistCapture(): void;
}

let liveRunPanelGateway: LiveRunPanelGateway | undefined;

export function setLiveRunPanelGateway(
  gateway: LiveRunPanelGateway | undefined
): void {
  liveRunPanelGateway = gateway;
}

export function postLiveRunMessage(message: LivePanelToWebviewMessage): void {
  liveRunPanelGateway?.post(message);
}

export function clearLiveRunPanel(): void {
  liveRunPanelGateway?.clear();
}

export function persistLivePanelCaptureNow(): void {
  liveRunPanelGateway?.persistCapture();
}
