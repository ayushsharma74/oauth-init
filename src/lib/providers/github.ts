import { execa } from "execa";
import { log, spinner, select, text, password, isCancel, cancel, note, confirm } from "@clack/prompts";
import open from "open";
import http from "http";
import { OAuthProvider, SaveOption } from "../../types.js";
import { saveCredentials } from "../save-credentials.js";
import { askSaveOption } from "../ask-save-option.js";
import { globalConfig } from "../config.js";

function logStep(message: string) {
  if (!globalConfig.quiet) log.step(message);
}

function logMessage(message: string) {
  if (!globalConfig.quiet) log.message(message);
}

export class GitHubAuthProvider implements OAuthProvider {
  async run(callbackUrl: string) {
    try {
      const appType = await select({
        message: "What type of GitHub app you want to create?",
        options: [
          {
            value: "gh-app",
            label: "GitHub App (One click setup)",
          },
          {
            value: "oauth-app",
            label: "OAuth App (You need to fill a form for this)",
          },
        ],
      });

      if (isCancel(appType)) return cancel("Setup aborted.");

      if (appType === "gh-app") {
        await this.setupGitHubApp(callbackUrl);
      } else if (appType === "oauth-app") {
        await this.setupOAuthApp(callbackUrl);
      }
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }

  private async setupGitHubApp(callbackUrl: string): Promise<void> {
    const saveOption = await askSaveOption();
    if (isCancel(saveOption)) return cancel("Setup aborted.");

    const PORT = 3004;
    const REDIRECT_URI = `http://localhost:${PORT}/callback`;

    const manifest = {
      name: "oauth-init-app",
      url: "http://localhost:3000",
      callback_url: callbackUrl,
      public: false,
      default_permissions: {
        contents: "read",
        metadata: "read",
      },
      redirect_url: REDIRECT_URI,
    };

    const htmlContent = `
        <html>
          <body>
            <form id="gh-form" action="https://github.com/settings/apps/new" method="post">
              <input type="hidden" name="manifest" value='${JSON.stringify(manifest)}'>
            </form>
            <script>document.getElementById("gh-form").submit();</script>
          </body>
        </html>
      `;

    logStep("GitHub App Configuration");
    logMessage("Opening GitHub with your manifest...");

    return new Promise((resolve) => {
      const server = http
        .createServer(async (req, res) => {
          const url = new URL(req.url!, `http://localhost:${PORT}`);
          const code = url.searchParams.get("code");

          if (code) {
            res.end(
              "<h1>Success!</h1><p>You can close this tab and return to the CLI.</p>",
            );

            const s = spinner();
            s.start("Exchanging code for secrets...");

            try {
              const { stdout } = await execa("curl", [
                "-X",
                "POST",
                `https://api.github.com/app-manifests/${code}/conversions`,
              ]);

              const credentials = JSON.parse(stdout);
              const { client_id, client_secret } = credentials;

              s.stop("Credentials received!");

              await saveCredentials(
                client_id,
                client_secret,
                "github",
                saveOption as SaveOption
              );
              server.close();
              resolve();
            } catch {
              s.error("Failed to convert manifest code.");
              server.close();
              resolve();
            }
          } else {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(htmlContent);
          }
        })
        .listen(PORT, async () => {
          if (!globalConfig.noOpen) {
            await open(REDIRECT_URI);
          }
        });
    });
  }

  private async setupOAuthApp(callbackUrl: string): Promise<void> {
    logStep("Step 1: Create OAuth App on GitHub");
    const oauthAppUrl = "https://github.com/settings/applications/new";
    logMessage(`Opening: ${oauthAppUrl}`);

    note(
      `Required Authorization callback URL:\n${callbackUrl}`,
      "Save this URL",
    );

    if (!globalConfig.noOpen) {
      const shouldOpen = globalConfig.skipPrompts ? true : await confirm({
        message: "Open GitHub OAuth App page?",
        initialValue: true,
      });
      if (isCancel(shouldOpen)) return cancel("Setup aborted.");
      if (shouldOpen) await open(oauthAppUrl);
    }

    if (!globalConfig.skipPrompts) {
      note(
        "1. Fill Application Name and Homepage URL\n2. Enter Authorization callback URL\n3. Click 'Register application'",
        "Action Required",
      );

      const brandDone = await text({
        message:
          "Press Enter once you've created the OAuth App (or type 'skip' if done previously)",
      });
      if (isCancel(brandDone)) return cancel("Setup aborted.");
    }

    logStep("Step 2: Save credentials");

    if (globalConfig.skipPrompts) {
      log.error("Client ID and Secret required in non-interactive mode. Run without --skip-prompts");
      process.exit(1);
    }

    const clientId = await text({
      message: "Paste your Client ID:",
      placeholder: "Iv1.xxx",
    });
    if (isCancel(clientId)) return cancel("Setup aborted.");

    const clientSecret = await password({
      message: "Paste your Client Secret:",
    });
    if (isCancel(clientSecret)) return cancel("Setup aborted.");

    const saveOption = await askSaveOption();
    if (isCancel(saveOption)) return cancel("Setup aborted.");

    await saveCredentials(
      clientId,
      clientSecret,
      "github",
      saveOption as SaveOption
    );
  }
}
