import { execa } from "execa";
import { log, spinner, select, text, password, isCancel, cancel, note } from "@clack/prompts";
import open from "open";
import { OAuthProvider, SaveOption } from "../types.js";
import { saveCredentials } from "./save-credentials.js";
import { askSaveOption } from "./ask-save-option.js";
import { globalConfig } from "./config.js";

function logStep(message: string) {
  if (!globalConfig.quiet) log.step(message);
}

function logInfo(message: string) {
  if (!globalConfig.quiet) log.info(message);
}

function logMessage(message: string) {
  if (!globalConfig.quiet) log.message(message);
}

async function checkGcloudAuth(): Promise<boolean> {
  const s = spinner();
  s.start("Checking gcloud CLI...");

  try {
    await execa("gcloud", ["version"]);
  } catch {
    s.stop("gcloud CLI not found.");
    log.error(
      "gcloud CLI is required for Google OAuth setup.\n" +
        "Install it: https://cloud.google.com/sdk/docs/install\n" +
        "Then run: gcloud auth login"
    );
    return false;
  }

  s.stop("gcloud CLI found.");

  const authSpinner = spinner();
  authSpinner.start("Checking gcloud authentication...");

  try {
    const { stdout } = await execa("gcloud", [
      "auth",
      "list",
      "--format=value(account)",
      "--filter=status:ACTIVE",
    ]);

    if (!stdout.trim()) {
      authSpinner.stop("Not authenticated.");
      log.error("Please run: gcloud auth login");
      return false;
    }

    authSpinner.stop(`Authenticated as: ${stdout.trim()}`);
    return true;
  } catch {
    authSpinner.stop("Authentication check failed.");
    return false;
  }
}

export class GoogleAuthProvider implements OAuthProvider {
  async run(_appName: string) {
    try {
      const isAuthenticated = await checkGcloudAuth();
      if (!isAuthenticated) {
        log.error("Please install gcloud CLI and authenticate before continuing.");
        process.exit(1);
      }

      const googleLoading = spinner();
      googleLoading.start("Fetching google cloud projects");
      const { stdout: currentProject } = await execa("gcloud", [
        "config",
        "get-value",
        "project",
      ]);

      const { stdout: cloudProjectsJSON } = await execa("gcloud", [
        "projects",
        "list",
        "--format=json",
      ]);

      const projectsList = JSON.parse(cloudProjectsJSON);
      googleLoading.stop("Fetched Projects");

      if (!projectsList || projectsList.length === 0) {
        log.error("No Google Cloud projects found. Create one at https://console.cloud.google.com");
        process.exit(1);
      }

      const projectId = await select({
        message: "Select your project",
        options: projectsList.map((project: any) => {
          if (project.projectId === currentProject) {
            return {
              label: `${project.name} (Default)`,
              value: project.projectId,
            };
          }
          return {
            label: project.name,
            value: project.projectId,
          };
        }),
      });

      logInfo(`Active Project: ${projectId}`);

      logStep("Step 1: Configure OAuth Consent Screen");
      const brandUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${projectId}`;
      logMessage(
        `Google requires manual setup for personal projects.\nOpening: ${brandUrl}`,
      );

      if (!globalConfig.noOpen) {
        await open(brandUrl);
      }
      note(
        "1. Choose 'External'\n2. Fill App Name & Email\n3. Click 'Save and Continue' through to the end.",
        "Action Required",
      );

      const brandDone = await text({
        message:
          "Press Enter once you've saved the Consent Screen (or type 'skip' if done previously)",
      });
      if (isCancel(brandDone)) return cancel("Setup aborted.");

      logStep("Step 2: Create OAuth Client ID");
      const clientUrl = `https://console.cloud.google.com/apis/credentials/oauthclient?project=${projectId}`;
      logMessage(`Opening: ${clientUrl}`);

      if (!globalConfig.noOpen) {
        await open(clientUrl);
      }
      note(
        "1. Select 'Web Application'\n2. Add your Redirect URIs\n3. Click 'Create'",
        "Action Required",
      );

      const clientId = await text({
        message: "Paste your Client ID:",
        placeholder: "12345-abcde.apps.googleusercontent.com",
        validate: (value) =>
          value?.includes(".apps.googleusercontent.com")
            ? undefined
            : "Invalid format",
      });
      if (isCancel(clientId)) return cancel("Setup aborted.");

      const clientSecret = await password({
        message: "Paste your Client Secret:",
      });
      if (isCancel(clientSecret)) return cancel("Setup aborted.");

      logStep("Step 3: Save credentials");
      const saveOption = await askSaveOption();
      if (isCancel(saveOption)) return cancel("Setup aborted.");

      await saveCredentials(
        clientId,
        clientSecret,
        "google",
        saveOption as SaveOption
      );
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }
}
