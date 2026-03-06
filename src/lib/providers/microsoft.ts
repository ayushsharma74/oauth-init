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

export class MicrosoftAuthProvider implements OAuthProvider {
  async run(callbackUrl: string): Promise<void> {
    try {
      logStep("Step 1: Create Microsoft App Registration");
      const portalUrl = "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade";
      logMessage(`Opening Azure portal: ${portalUrl}`);

      note(
        `Required Redirect URI:\n${callbackUrl}`,
        "Save this URL",
      );

      if (!globalConfig.noOpen) {
        const shouldOpen = globalConfig.skipPrompts ? true : await confirm({
          message: "Open Azure App Registrations page?",
          initialValue: true,
        });
        if (isCancel(shouldOpen)) return cancel("Setup aborted.");
        if (shouldOpen) await open(portalUrl);
      }

      if (!globalConfig.skipPrompts) {
        note(
          "1. Click 'New registration' and enter app name\n" +
            "2. Choose supported account type (multitenant usually recommended)\n" +
            "3. Add Web Redirect URI using the URL above\n" +
            "4. Create a new client secret under 'Certificates & secrets'\n" +
            "5. Copy Application (client) ID, Directory (tenant) ID, and secret value",
          "Action Required",
        );
      }

      logStep("Step 2: Collect credentials");

      if (globalConfig.skipPrompts) {
        log.error("Client ID, Tenant ID and Client Secret required in non-interactive mode. Run without --skip-prompts");
        process.exit(1);
      }

      const clientId = await text({
        message: "Paste your Application (client) ID:",
        placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        validate: (value) =>
          !value || !/^[a-f0-9-]{36}$/i.test(value) ? "Invalid client ID format" : undefined,
      });
      if (isCancel(clientId)) return cancel("Setup aborted.");

      const tenantId = await text({
        message: "Paste your Directory (tenant) ID (or 'common'):",
        placeholder: "common",
        defaultValue: "common",
        validate: (value) => {
          if (!value) return "Tenant ID is required";
          if (value === "common") return undefined;
          return /^[a-f0-9-]{36}$/i.test(value) ? undefined : "Invalid tenant ID format";
        },
      });
      if (isCancel(tenantId)) return cancel("Setup aborted.");

      const clientSecret = await password({
        message: "Paste your Client Secret value:",
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
        "microsoft",
        saveOption as SaveOption,
        { MICROSOFT_TENANT_ID: tenantId as string },
      );
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }
}
