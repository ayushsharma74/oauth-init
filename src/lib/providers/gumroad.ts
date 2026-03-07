import { cancel, confirm, isCancel, log, note, password, text } from "@clack/prompts";
import open from "open";
import { OAuthProvider, SaveOption } from "../../types.js";
import { askSaveOption } from "../ask-save-option.js";
import { globalConfig } from "../config.js";
import { saveCredentials } from "../save-credentials.js";

function logStep(message: string) {
  if (!globalConfig.quiet) log.step(message);
}

function logMessage(message: string) {
  if (!globalConfig.quiet) log.message(message);
}

export class GumroadAuthProvider implements OAuthProvider {
  async run(callbackUrl: string): Promise<void> {
    try {
      logStep("Step 1: Create Gumroad Application");

      const portalUrl = "https://gumroad.com/settings/advanced#application-form";
      logMessage(`Opening Gumroad Advanced settings: ${portalUrl}`);

      note(
        `Required Redirect URI:\n${callbackUrl}`,
        "Save this URL",
      );

      if (!globalConfig.noOpen) {
        const shouldOpen = globalConfig.skipPrompts ? true : await confirm({
          message: "Open Gumroad application settings?",
          initialValue: true,
        });
        if (isCancel(shouldOpen)) return cancel("Setup aborted.");
        if (shouldOpen) await open(portalUrl);
      }

      if (!globalConfig.skipPrompts) {
        note(
          "1. Sign in to Gumroad and open Advanced settings\n" +
            "2. Scroll to the application form\n" +
            "3. Enter an application icon and name\n" +
            "4. Paste the Redirect URI shown above\n" +
            "5. Click 'Create application'\n" +
            "6. Copy the Application ID and Application Secret",
          "Action Required",
        );
      }

      logStep("Step 2: Collect Credentials");

      if (globalConfig.skipPrompts) {
        log.error("Client ID and Secret required in non-interactive mode. Run without --skip-prompts");
        process.exit(1);
      }

      const clientId = await text({
        message: "Paste your Gumroad Application ID (Client ID):",
        placeholder: "f74e4939f6f9...",
        validate: (value) =>
          !value || value.length < 16 ? "Application ID looks too short" : undefined,
      });
      if (isCancel(clientId)) return cancel("Setup aborted.");

      const clientSecret = await password({
        message: "Paste your Gumroad Application Secret:",
        validate: (value) =>
          !value || value.length < 16 ? "Application Secret looks too short" : undefined,
      });
      if (isCancel(clientSecret)) return cancel("Setup aborted.");

      logStep("Step 3: Save credentials");
      const saveOption = await askSaveOption();
      if (isCancel(saveOption)) return cancel("Setup aborted.");

      await saveCredentials(
        clientId as string,
        clientSecret as string,
        "gumroad",
        saveOption as SaveOption,
      );
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }
}
