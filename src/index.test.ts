import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { globalConfig } from "./lib/config.js";
import { saveCredentials } from "./lib/save-credentials.js";

const testDir = join(import.meta.dir, "test-temp");
const originalCwd = process.cwd();

beforeEach(async () => {
  await rm(testDir, { recursive: true, force: true });
  await mkdir(testDir, { recursive: true });
  process.chdir(testDir);
  globalConfig.skipPrompts = true;
  globalConfig.noOpen = true;
  globalConfig.quiet = true;
});

afterEach(() => {
  process.chdir(originalCwd);
});

describe("saveCredentials", () => {
  test("writes to .env file", async () => {
    await saveCredentials("test-id", "test-secret", "google", "dot-env");
    const content = await readFile(join(testDir, ".env"), "utf-8");
    expect(content).toContain("GOOGLE_CLIENT_ID=test-id");
    expect(content).toContain("GOOGLE_CLIENT_SECRET=test-secret");
  });

  test("writes to .json file", async () => {
    await saveCredentials("test-id", "test-secret", "github", "json");
    const content = await readFile(join(testDir, "github-credentials.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.clientId).toBe("test-id");
    expect(parsed.clientSecret).toBe("test-secret");
  });

  test("persists microsoft tenant id in env output", async () => {
    await saveCredentials("ms-id", "ms-secret", "microsoft", "dot-env-dot-local", {
      MICROSOFT_TENANT_ID: "common",
    });
    const content = await readFile(join(testDir, ".env.local"), "utf-8");
    expect(content).toContain("MICROSOFT_CLIENT_ID=ms-id");
    expect(content).toContain("MICROSOFT_CLIENT_SECRET=ms-secret");
    expect(content).toContain("MICROSOFT_TENANT_ID=common");
  });
});
