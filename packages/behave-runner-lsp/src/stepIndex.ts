import * as fs from "fs/promises";
import fg from "fast-glob";
import {
  DEFAULT_STEP_DEFINITION_PATTERNS,
  parseStepDefinitionsFromPython,
  type StepDefinition,
} from "@behave-runner/core";

export class StepDefinitionIndex {
  private definitions: StepDefinition[] = [];
  private patterns: string[] = DEFAULT_STEP_DEFINITION_PATTERNS;
  private workspaceRoots: string[] = [];

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots;
  }

  setPatterns(patterns: string[]): void {
    this.patterns =
      patterns.length > 0 ? patterns : DEFAULT_STEP_DEFINITION_PATTERNS;
  }

  getPatterns(): string[] {
    return this.patterns;
  }

  getDefinitions(): StepDefinition[] {
    return this.definitions;
  }

  async rebuild(): Promise<void> {
    const next: StepDefinition[] = [];
    const seenFiles = new Set<string>();

    for (const root of this.workspaceRoots) {
      for (const pattern of this.patterns) {
        const entries = await fg(pattern, {
          cwd: root,
          absolute: true,
          onlyFiles: true,
          ignore: ["**/node_modules/**"],
        });
        for (const filePath of entries) {
          if (seenFiles.has(filePath)) {
            continue;
          }
          seenFiles.add(filePath);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            next.push(
              ...parseStepDefinitionsFromPython(filePath, content)
            );
          } catch {
            // unreadable or missing
          }
        }
      }
    }
    this.definitions = next;
  }
}
