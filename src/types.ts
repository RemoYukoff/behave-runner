export type {
  FeatureStep,
  StepDefinition,
  StepInfo,
  StepKeyword
} from "@behave-runner/core";

/** Arguments for `behaveRunner.debugScenario` (e.g. keybindings). */
export type RunScenarioArgs = {
  filePath: string;
  scenarioName?: string;
  runAll: boolean;
  workspaceRoot: string;
};
