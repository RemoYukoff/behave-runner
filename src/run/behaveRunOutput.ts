import * as vscode from "vscode";
import { normalizeToCrlfChunk } from "../text/normalizeCrlf";

let behaveOutputChannel: vscode.OutputChannel | undefined;

export function getBehaveOutputChannel(): vscode.OutputChannel {
  if (!behaveOutputChannel) {
    behaveOutputChannel = vscode.window.createOutputChannel("Behave Runner");
  }
  return behaveOutputChannel;
}

export function appendRunOutput(text: string): void {
  getBehaveOutputChannel().append(normalizeToCrlfChunk(text));
}

export function registerBehaveOutputChannel(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(getBehaveOutputChannel());
}
