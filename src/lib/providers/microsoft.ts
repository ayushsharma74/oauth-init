import { execa } from "execa";
import { log, spinner, select, text, password, isCancel, cancel, note, confirm } from "@clack/prompts";
import open from "open";
import { OAuthProvider, SaveOption } from "../../types.js";
import { saveCredentials } from "../save-credentials.js";
import { askSaveOption } from "../ask-save-option.js";
import { globalConfig } from "../config.js";

function logStep(message: string) {
  if (!globalConfig.quiet) log.step(message);
}

function logInfo(message: string) {
  if (!globalConfig.quiet) log.info(message);
}

function logMessage(message: string) {
  if (!globalConfig.quiet) log.message(message);
}

type MicrosoftApp = {
  name: string;
  appId: string;
};

const CREATE_NEW_MICROSOFT_APP_OPTION = "register_new_microsoft_app";

async function loadMicrosoftApplications(
  startMessage = "Fetching azure applications",
): Promise<MicrosoftApp[]> {
  const loading = spinner();
  loading.start(startMessage);
  const { stdout } = await execa("az", [
    "ad",
    "app",
    "list",
    "--query",
    "[].{name:displayName, appId:appId}",
    "-o",
    "json",
  ]);
  loading.stop("Fetched Applications");
  return JSON.parse(stdout) as MicrosoftApp[];
}

async function checkAzureAuth(): Promise<boolean> {
  const s = spinner();
  s.start("Checking azure CLI...");

  try {
    await execa("az", ["version"]);
  } catch {
    s.stop("azure CLI not found.");
    log.error(
      "azure CLI is required for Microsoft OAuth setup.\n" +
        "Install it: https://learn.microsoft.com/en-us/cli/azure/get-started-with-azure-cli?view=azure-cli-latest\n" +
        "Then run: az login"
    );
    return false;
  }

  s.stop("azure CLI found.");

  const authSpinner = spinner();
  authSpinner.start("Checking azure authentication and subscriptions...");

  try {
    const { stdout } = await execa("az", [
      "account",
      "list",
      "--query= [].{name:name,state:state,isDefault:isDefault}",
      "-o",
      "table"
    ]);

    if (!stdout.trim()) {
      authSpinner.stop("Not authenticated.");
      log.error("Please run: az login");
      return false;
    }

    authSpinner.stop(`Authenticated as: ${stdout.trim()}`);
    return true;
  } catch {
    authSpinner.stop("Authentication check failed.");
    return false;
  }
}

export class MicrosoftAuthProvider implements OAuthProvider {
  async run(_appName: string) {
    try {
      const isAuthenticated = await checkAzureAuth();
      if (!isAuthenticated) {
        log.error("Please install azure CLI and authenticate before continuing.");
        process.exit(1);
      }

      let appsList = await loadMicrosoftApplications();
      if (!appsList || appsList.length === 0) {
        log.error(
          "No Azure applications found. Create one at https://entra.microsoft.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
        );
        process.exit(1);
      }

      logStep(
        "Step 1: Select from existing applications or register a new application in Microsoft Entra Admin Center"
      );
      const brandUrl = `https://entra.microsoft.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade`;

      let selectedAppId: string | undefined;
      while (!selectedAppId) {
        const options = [
          {
            label: "Register a new Microsoft Entra application",
            value: CREATE_NEW_MICROSOFT_APP_OPTION,
          },
          ...appsList.map((app) => ({
            label: app.appId ? `${app.name} (Default)` : app.name,
            value: app.appId,
          })),
        ];

        const selection = await select({
          message: "Select your application",
          options,
        });
        if (isCancel(selection)) return cancel("Setup aborted.");

        if (selection === CREATE_NEW_MICROSOFT_APP_OPTION) {
          logMessage(
            `Microsoft Entra requires manual setup for personal projects.\nOpening: ${brandUrl}`
          );

          note(`Required Redirect URI:\n${_appName}`, "Save this URL");

          if (!globalConfig.noOpen) {
            const shouldOpen = globalConfig.skipPrompts
              ? true
              : await confirm({
                  message: "Open Microsoft Entra Admin Center?",
                  initialValue: true,
                });
            if (isCancel(shouldOpen)) return cancel("Setup aborted.");
            if (shouldOpen) await open(brandUrl);
          }

          if (!globalConfig.skipPrompts) {
            note(
              "1. Click on New Registration\n2. Fill App Name & Redirect URI\n3. Click Register",
              "Action Required"
            );

            const brandDone = await text({
              message:
                "Press Enter once you've saved the Consent Screen (or type 'skip' if done previously)",
            });
            if (isCancel(brandDone)) return cancel("Setup aborted.");
          }

          appsList = await loadMicrosoftApplications("Refreshing azure applications");
          if (!appsList || appsList.length === 0) {
            log.error(
              "No Azure applications found. Create one at https://entra.microsoft.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade"
            );
            process.exit(1);
          }
          continue;
        }

        if (typeof selection !== "string") {
          continue;
        }
        selectedAppId = selection;
      }

      if (!selectedAppId) {
        log.error("No application selected.");
        process.exit(1);
      }
      const appId = selectedAppId;
      logInfo(`Registered Apps: ${appId}`);



      logStep("Step 2: Copy OAuth Application(client) ID");
      const clientUrl = `https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationMenuBlade/~/Overview/appId/${appId}/`;
      logMessage(`Opening: ${clientUrl}`);

      note(
        `Required Redirect URI:\n${_appName}`,
        "Save this URL",
      );

      if (!globalConfig.noOpen) {
        const shouldOpen = globalConfig.skipPrompts ? true : await confirm({
          message: "Check overview of your registered application?",
          initialValue: true,
        });
        if (isCancel(shouldOpen)) return cancel("Setup aborted.");
        if (shouldOpen) await open(clientUrl);
      }

      if (!globalConfig.skipPrompts) {
        note(
          "1. Copy Application (Client) ID from overview\n2. Create a new client secret, Under Manage \n3. Select 'Certificates & Secrets' -> 'New client secret' -> Copy the value (save the secret when created as it won't be shown again)",
          "Action Required",
        );
      }

      let clientId: string | symbol;
      let clientSecret: string | symbol;

      if (globalConfig.skipPrompts) {
        log.error("Client ID and Secret required in non-interactive mode. Run without --skip-prompts");
        process.exit(1);
      }

      clientId = await text({
        message: "Paste your Client ID:",
        placeholder: "2893e9ee-8956-4825-9923-84b21943bb24",
      });
      if (isCancel(clientId)) return cancel("Setup aborted.");

      clientSecret = await password({
        message: "Paste your Client Secret:",
      });
      if (isCancel(clientSecret)) return cancel("Setup aborted.");

      logStep("Step 3: Save credentials");
      const saveOption = await askSaveOption();
      if (isCancel(saveOption)) return cancel("Setup aborted.");

      await saveCredentials(
        clientId,
        clientSecret,
        "microsoft",
        saveOption as SaveOption
      );
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }
} 
