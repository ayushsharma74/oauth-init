import { writeFile, readFile, access } from "fs/promises";
import { log, isCancel, confirm } from "@clack/prompts";
import { Provider, SaveOption } from "../types.js";
import { globalConfig } from "./config.js";

export async function saveCredentials(
  clientId: string,
  clientSecret: string,
  provider: Provider,
  saveOption: SaveOption,
): Promise<void> {
  const envKeyId = `${provider.toUpperCase()}_CLIENT_ID`;
  const envKeySecret = `${provider.toUpperCase()}_CLIENT_SECRET`;
  const newEnvContent = `${envKeyId}=${clientId}\n${envKeySecret}=${clientSecret}`;

  if (saveOption === "print") {
    log.message(newEnvContent);
    log.success("Credentials printed to console");
    return;
  }

  if (saveOption === "json") {
    const jsonContent = JSON.stringify({ clientId, clientSecret }, null, 2);
    const jsonPath = `${provider}-credentials.json`;

    if (!globalConfig.skipPrompts) {
      log.message("Preview:");
      log.message(jsonContent);
      const confirmSave = await confirm({
        message: `Save to ${jsonPath}?`,
        initialValue: true,
      });
      if (isCancel(confirmSave) || !confirmSave) {
        log.warn("Credentials not saved.");
        return;
      }
    }

    await writeFile(jsonPath, jsonContent);
    log.success(`Credentials saved to ${jsonPath}`);
    return;
  }

  const envPath = saveOption === "dot-env" ? ".env" : ".env.local";

  if (!globalConfig.skipPrompts) {
    log.message("Preview:");
    log.message(newEnvContent);
    const confirmSave = await confirm({
      message: `Save to ${envPath}?`,
      initialValue: true,
    });
    if (isCancel(confirmSave) || !confirmSave) {
      log.warn("Credentials not saved.");
      return;
    }
  }

  try {
    await access(envPath);
    const shouldAppend = globalConfig.skipPrompts
      ? true
      : await confirm({
          message: `${envPath} already exists. Append credentials?`,
          initialValue: true,
        });

    if (isCancel(shouldAppend) || !shouldAppend) {
      log.warn("Credentials not saved.");
      return;
    }

    const existingContent = await readFile(envPath, "utf-8");
    await writeFile(envPath, existingContent + "\n" + newEnvContent);
  } catch {
    await writeFile(envPath, newEnvContent);
  }

  log.success(`Credentials saved to ${envPath}`);
}
