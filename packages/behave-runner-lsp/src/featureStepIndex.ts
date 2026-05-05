import * as fs from "fs/promises";
import fg from "fast-glob";
import {
  behavePatternToRegex,
  DEFAULT_FEATURE_FILE_PATTERNS,
  extractFeatureStepsFromContent,
  type FeatureStep,
  type StepKeyword,
} from "@behave-runner/core";

export class FeatureStepIndex {
  private steps: FeatureStep[] = [];
  private regexCache = new Map<string, RegExp>();
  private patterns: string[] = DEFAULT_FEATURE_FILE_PATTERNS;
  private workspaceRoots: string[] = [];

  setWorkspaceRoots(roots: string[]): void {
    this.workspaceRoots = roots;
  }

  setPatterns(patterns: string[]): void {
    this.patterns =
      patterns.length > 0 ? patterns : DEFAULT_FEATURE_FILE_PATTERNS;
  }

  getPatterns(): string[] {
    return this.patterns;
  }

  findMatchingSteps(
    pattern: string,
    keyword?: StepKeyword
  ): FeatureStep[] {
    let regex = this.regexCache.get(pattern);
    if (!regex) {
      regex = behavePatternToRegex(pattern);
      this.regexCache.set(pattern, regex);
    }

    return this.steps.filter((step) => {
      if (keyword && keyword !== "step") {
        if (step.effectiveKeyword !== keyword) {
          return false;
        }
      }
      return regex!.test(step.text.trim());
    });
  }

  async rebuild(): Promise<void> {
    this.regexCache.clear();
    const next: FeatureStep[] = [];
    const seenFiles = new Set<string>();

    for (const root of this.workspaceRoots) {
      for (const globPattern of this.patterns) {
        const entries = await fg(globPattern, {
          cwd: root,
          absolute: true,
          onlyFiles: true,
          ignore: ["**/node_modules/**"],
        });
        for (const filePath of entries) {
          if (!filePath.endsWith(".feature") || seenFiles.has(filePath)) {
            continue;
          }
          seenFiles.add(filePath);
          try {
            const content = await fs.readFile(filePath, "utf-8");
            next.push(...extractFeatureStepsFromContent(filePath, content));
          } catch {
            // skip
          }
        }
      }
    }
    this.steps = next;
  }
}
