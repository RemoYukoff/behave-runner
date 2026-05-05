import * as cp from "child_process";
import * as path from "path";
import type { BehaveJob } from "./behaveJobTypes";

export function liveFormatterBundlePath(extensionPath: string): string {
  return path.join(extensionPath, "media", "python");
}

export function spawnBehave(
  job: BehaveJob,
  cwd: string,
  interpreterPath: string | undefined,
  jsonReportPath: string,
  opts: {
    liveStream: boolean;
    liveFormatterPythonRoot: string | undefined;
  }
): cp.ChildProcessWithoutNullStreams {
  const behaveArgs: string[] = [
    "--no-capture-stdout",
    "-f",
    "json",
    "-o",
    jsonReportPath
  ];
  if (opts.liveStream && opts.liveFormatterPythonRoot) {
    behaveArgs.push(
      "--no-summary",
      "-f",
      "behave_runner_live:BehaveRunnerLiveFormatter"
    );
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
