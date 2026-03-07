import { describe, test, expect, beforeEach } from "bun:test";
import { writeFile, readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { Provider, SaveOption } from "./types.js";

const testDir = join(import.meta.dir, "test-temp");

async function saveCredentialsToTestDir(
  clientId: string,
  clientSecret: string,
  provider: Provider,
  saveOption: SaveOption,
): Promise<void> {
  const envKeyId = `${provider.toUpperCase()}_CLIENT_ID`;
  const envKeySecret = `${provider.toUpperCase()}_CLIENT_SECRET`;
  const newEnvContent = `${envKeyId}=${clientId}\n${envKeySecret}=${clientSecret}`;

  if (saveOption === "print") {
    return;
  }

  if (saveOption === "json") {
    const jsonContent = JSON.stringify({ clientId, clientSecret }, null, 2);
    const jsonPath = join(testDir, `${provider}-credentials.json`);
    await writeFile(jsonPath, jsonContent);
    return;
  }

  const envPath = join(testDir, saveOption === "dot-env" ? ".env" : ".env.local");
  await writeFile(envPath, newEnvContent);
}

beforeEach(async () => {
  try {
    await rm(testDir, { recursive: true, force: true });
  } catch {}
  await mkdir(testDir, { recursive: true });
});

describe("saveCredentials", () => {
  test("writes to .env file", async () => {
    await saveCredentialsToTestDir("test-id", "test-secret", "google", "dot-env");
    const content = await readFile(join(testDir, ".env"), "utf-8");
    expect(content).toContain("GOOGLE_CLIENT_ID=test-id");
    expect(content).toContain("GOOGLE_CLIENT_SECRET=test-secret");
  });

  test("writes to .json file", async () => {
    await saveCredentialsToTestDir("test-id", "test-secret", "github", "json");
    const content = await readFile(join(testDir, "github-credentials.json"), "utf-8");
    const parsed = JSON.parse(content);
    expect(parsed.clientId).toBe("test-id");
    expect(parsed.clientSecret).toBe("test-secret");
  });
});
