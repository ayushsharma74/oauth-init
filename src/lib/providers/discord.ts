import { cancel, isCancel, log, note, password, text, confirm } from "@clack/prompts";
import { OAuthProvider, SaveOption } from "../../types.js";
import { globalConfig } from "../config.js";
import open from "open";
import { askSaveOption } from "../ask-save-option.js";
import { saveCredentials } from "../save-credentials.js";

function logStep(message: string) {
  if (!globalConfig.quiet) log.step(message);
}

function logMessage(message: string) {
  if (!globalConfig.quiet) log.message(message);
}

export class DiscordAuthProvider implements OAuthProvider {
  async run(callbackUrl: string): Promise<void> {
    try {
      logStep("Step 1: Create Discord Application");
      const portalUrl =
        "https://discord.com/developers/applications?new_app=true";
      logMessage(`Opening Discord Developer Portal: ${portalUrl}`);

      note(
        `Required Redirect URI:\n${callbackUrl}`,
        "Save this URL",
      );

      if (!globalConfig.noOpen) {
        const shouldOpen = globalConfig.skipPrompts ? true : await confirm({
          message: "Open Discord Developer Portal?",
          initialValue: true,
        });
        if (isCancel(shouldOpen)) return cancel("Setup aborted.");
        if (shouldOpen) await open(portalUrl);
      }

      if (!globalConfig.skipPrompts) {
        note(
          "1. Click 'New Application' and give it a name.\n" +
            "2. Go to 'Overview' -> 'OAuth2' in the sidebar.\n" +
            "3. Click 'Add Redirect' and paste your callback URL\n4. Click 'Reset Secret' if you don't have a Client Secret",
          "Action Required",
        );
      }

      logStep("Step 2: Collect Credentials");

      if (globalConfig.skipPrompts) {
        log.error("Client ID and Secret required in non-interactive mode. Run without --skip-prompts");
        process.exit(1);
      }

      const clientId = await text({
        message: "Enter your Discord Client ID:",
        placeholder: "123456789012345678",
        validate: (value) =>
          !value || !/^\d{17,19}$/.test(value) ? "Invalid Discord ID" : undefined,
      });
      if (isCancel(clientId)) return cancel("Setup aborted.");

      const clientSecret = await password({
        message: "Enter your Discord Client Secret:",
        validate: (value) =>
          !value || value.length < 10 ? "Secret too short" : undefined,
      });
      if (isCancel(clientSecret)) return cancel("Setup aborted.");

      logStep("Step 3: Save credentials");
      const saveOption = await askSaveOption();
      if (isCancel(saveOption)) return cancel("Setup aborted.");

      await saveCredentials(
        clientId as string,
        clientSecret as string,
        "discord",
        saveOption as SaveOption,
      );
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }
}
