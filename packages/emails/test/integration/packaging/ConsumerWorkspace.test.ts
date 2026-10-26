import { access, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, it } from "vitest";

import { withConsumerWorkspace } from "../../fixtures/consumers/workspace.js";

it("removes a partially populated consumer workspace when verification fails", async () => {
  const failure = new Error("fixture command failed");
  let workspace = "";
  await expect(
    withConsumerWorkspace(async (directory) => {
      workspace = directory;
      await writeFile(join(directory, "partial-install.txt"), "inert fixture");
      throw failure;
    }),
  ).rejects.toBe(failure);

  expect(workspace).not.toBe("");
  await expect(access(workspace)).rejects.toMatchObject({ code: "ENOENT" });
});
