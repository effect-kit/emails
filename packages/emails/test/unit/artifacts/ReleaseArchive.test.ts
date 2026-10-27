import { createHash } from "node:crypto";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { withConsumerWorkspace } from "#/test/fixtures/consumers/workspace.js";
import { readReleaseArchive, releaseOptions } from "#/test/runners/artifacts/ReleaseArchive.js";

describe("release consumer selection", () => {
  it("preserves the complete consumer matrix by default", () => {
    expect(releaseOptions(["--pack-dir", "/tmp/candidate"]).fixture).toBe("all");
  });

  it("selects the fast core consumer without losing archive or provenance options", () => {
    const options = releaseOptions([
      "--",
      "--fixture",
      "core",
      "--pack-dir",
      "/tmp/candidate",
      "--provenance",
    ]);

    expect(options.fixture).toBe("core");
    expect(options.directory).toBe("/tmp/candidate");
    expect(options.provenance).toBe(true);
  });

  it("rejects unsupported consumer selections", () => {
    expect(() => releaseOptions(["--pack-dir", "/tmp/candidate", "--fixture", "../other"])).toThrow(
      "Use --fixture core or all",
    );
  });
});

const writePlan = async (directory: string, path: string, integrity: string) => {
  await writeFile(
    join(directory, "publish-plan.json"),
    JSON.stringify({
      version: 1,
      plan: [
        [
          {
            kind: "publish",
            name: "@effect-kit/emails",
            version: "0.0.0",
            access: "public",
            tag: "latest",
            tarball: { path, integrity },
          },
        ],
      ],
    }),
  );
};

describe("release archive binding", () => {
  it("detects archive changes after the publish plan was generated", async () => {
    await withConsumerWorkspace(async (directory) => {
      await mkdir(join(directory, "packages"));
      const path = "packages/effect-kit-emails-0.0.0.tgz";
      const original = Buffer.from("verified bytes");
      const integrity = `sha256-${createHash("sha256").update(original).digest("base64")}`;
      await writePlan(directory, path, integrity);
      await writeFile(join(directory, path), original);
      const candidate = await readReleaseArchive(directory);
      expect(candidate.integrity).toBe(
        `sha512-${createHash("sha512").update(original).digest("base64")}`,
      );
      await writeFile(join(directory, path), "changed bytes");
      await expect(readReleaseArchive(directory)).rejects.toThrow("differs from its publish plan");
    });
  });

  it("rejects traversal paths and archives symlinked outside the artifact", async () => {
    await withConsumerWorkspace(async (directory) => {
      const packed = join(directory, "packed");
      await mkdir(join(packed, "packages"), { recursive: true });
      await writePlan(packed, "../outside.tgz", "sha256-unused");
      await expect(readReleaseArchive(packed)).rejects.toThrow("Unexpected release archive path");
      const outside = join(directory, "outside.tgz");
      await writeFile(outside, "outside");
      const path = "packages/effect-kit-emails-0.0.0.tgz";
      await symlink(outside, join(packed, path));
      await writePlan(packed, path, "sha256-unused");
      await expect(readReleaseArchive(packed)).rejects.toThrow("escapes the packed directory");
    });
  });
});
