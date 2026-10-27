import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export const runCommand = async (
  stage: string,
  command: string,
  arguments_: ReadonlyArray<string>,
  cwd: string,
  timeout = 120_000,
): Promise<string> => {
  try {
    return (await exec(command, arguments_, { cwd, timeout, maxBuffer: 2 * 1024 * 1024 })).stdout;
  } catch (error) {
    const code = error instanceof Error && "code" in error ? String(error.code) : "unknown";
    // oxlint-disable-next-line preserve-caught-error -- Registry diagnostics may contain credentials.
    throw new Error(`${stage} failed (code ${code})`);
  }
};
