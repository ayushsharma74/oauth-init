import { cancel, confirm, isCancel, log, note, password, text } from "@clack/prompts";
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

export class GitLabAuthProvider implements OAuthProvider {
  async run(callbackUrl: string): Promise<void> {
    try {
      logStep("Step 1: Create GitLab Application");

      const appType = await this.selectAppType();
      if (isCancel(appType)) return cancel("Setup aborted.");

      const portalUrl = this.getPortalUrl(appType as string);
      logMessage(`Opening GitLab: ${portalUrl}`);

      note(
        `Required Redirect URI:\n${callbackUrl}`,
        "Save this URL",
      );

      if (!globalConfig.noOpen) {
        const shouldOpen = globalConfig.skipPrompts ? true : await confirm({
          message: "Open GitLab Applications page?",
          initialValue: true,
        });
        if (isCancel(shouldOpen)) return cancel("Setup aborted.");
        if (shouldOpen) await open(portalUrl);
      }

      if (!globalConfig.skipPrompts) {
        const instructions = this.getInstructions(appType as string);
        note(instructions, "Action Required");
      }

      logStep("Step 2: Collect Credentials");

      const clientId = await this.promptClientId();
      if (isCancel(clientId)) return cancel("Setup aborted.");

      const clientSecret = await this.promptClientSecret();
      if (isCancel(clientSecret)) return cancel("Setup aborted.");

      logStep("Step 3: Save credentials");
      const saveOption = await askSaveOption();
      if (isCancel(saveOption)) return cancel("Setup aborted.");

      await saveCredentials(
        clientId as string,
        clientSecret as string,
        "gitlab",
        saveOption as SaveOption,
      );
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }

  private async selectAppType(): Promise<string | symbol> {
    if (globalConfig.skipPrompts) {
      return "user";
    }

    const { log, select, isCancel, cancel } = await import("@clack/prompts");

    return select({
      message: "What type of GitLab application?",
      options: [
        {
          value: "user",
          label: "User-owned Application",
          hint: "For GitLab.com personal apps",
        },
        {
          value: "group",
          label: "Group-owned Application",
          hint: "For GitLab.com group apps",
        },
        {
          value: "instance",
          label: "Instance-wide Application",
          hint: "For GitLab Self-Managed (admin only)",
        },
      ],
    });
  }

  private getPortalUrl(appType: string): string {
    switch (appType) {
      case "user":
        return "https://gitlab.com/-/user_settings/applications";
      case "group":
        return "https://gitlab.com/groups/-/settings/applications";
      case "instance":
        return "https://gitlab.com/admin/applications";
      default:
        return "https://gitlab.com/-/user_settings/applications";
    }
  }

  private getInstructions(appType: string): string {
    switch (appType) {
      case "user":
        return (
          "1. Click 'Add new application'\n" +
          "2. Enter name and Redirect URI\n" +
          "3. Select scopes (openid, profile, email recommended)\n" +
          "4. Click 'Save application'\n" +
          "5. Copy Application ID and Secret"
        );
      case "group":
        return (
          "1. Go to Group → Settings → Applications\n" +
          "2. Click 'Add new application'\n" +
          "3. Enter name and Redirect URI\n" +
          "4. Select scopes (openid, profile, email recommended)\n" +
          "5. Click 'Save application'\n" +
          "6. Copy Application ID and Secret"
        );
      case "instance":
        return (
          "1. Click 'New application'\n" +
          "2. Enter name and Redirect URI\n" +
          "3. Select scopes (openid, profile, email recommended)\n" +
          "4. Mark as 'Trusted' to skip user authorization\n" +
          "5. Click 'Save application'\n" +
          "6. Copy Application ID and Secret"
        );
      default:
        return "Follow the on-screen instructions to create the application";
    }
  }

  private async promptClientId(): Promise<string | symbol> {
    if (globalConfig.skipPrompts) {
      log.error("Client ID required in non-interactive mode. Run without --skip-prompts");
      process.exit(1);
    }

    return text({
      message: "Paste your Application ID (Client ID):",
      placeholder: "abc123...",
    });
  }

  private async promptClientSecret(): Promise<string | symbol> {
    if (globalConfig.skipPrompts) {
      log.error("Client Secret required in non-interactive mode. Run without --skip-prompts");
      process.exit(1);
    }

    return password({
      message: "Paste your Client Secret:",
      validate: (value) =>
        !value || value.length < 10 ? "Secret too short" : undefined,
    });
  }
}
