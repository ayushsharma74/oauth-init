#!/usr/bin/env node
import { execa } from "execa";
import {
  intro,
  outro,
  log,
  spinner,
  note,
  text,
  isCancel,
  cancel,
  select,
  multiselect,
  password,
} from "@clack/prompts";
import open from "open";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import http from "http";
import { SaveOption } from "./types.js";
import { saveCredentials } from "./lib/save-credentials.js";

const globalConfig = {
  quiet: false,
  noOpen: false,
};



export class GoogleAuthProvider {
  async run(_appName: string) {
    try {
      // 1. Get Project ID from current gcloud context
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

      log.info(`Active Project: ${projectId}`);

      // 2. Step One: The Consent Screen (Brand)
      log.step("Step 1: Configure OAuth Consent Screen");
      const brandUrl = `https://console.cloud.google.com/apis/credentials/consent?project=${projectId}`;
      log.message(
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

      // 3. Step Two: Creating the Client ID
      log.step("Step 2: Create OAuth Client ID");
      const clientUrl = `https://console.cloud.google.com/apis/credentials/oauthclient?project=${projectId}`;
      log.message(`Opening: ${clientUrl}`);

      if (!globalConfig.noOpen) {
        await open(clientUrl);
      }
      note(
        "1. Select 'Web Application'\n2. Add your Redirect URIs\n3. Click 'Create'",
        "Action Required",
      );

      // 4. Step Three: Capturing and Validating
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

      // 5. Step Four: Save credentials
      log.step("Step 3: Save credentials");
      const saveOption = await select<SaveOption>({
        message: "Where do you want to save the credentials?",
        options: [
          {
            label: ".env",
            value: "dot-env",
          },
          {
            label: ".env.local",
            value: "dot-env-dot-local",
          },
          {
            label: ".json",
            value: "json",
          },
          {
            label: "print to the console",
            value: "print",
          },
        ],
      });

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

  /**
   * TODO: Pings Google's tokeninfo endpoint to verify the Client ID exists
   */
  private async validateCredentials(clientId: string): Promise<boolean> {
    const s = spinner();
    s.start("Verifying Client ID with Google...");
    try {
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?client_id=${clientId}`,
      );
      const isValid = res.status === 200;
      if (isValid) {
        s.stop("Client ID verified.");
      } else {
        s.stop("Invalid Client ID.");
      }
      return isValid;
    } catch {
      s.stop("Validation service unreachable.");
      return false;
    }
  }
}

export class GitHubAuthProvider {
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
    const saveOption = await this.askSaveOption();
    if (isCancel(saveOption)) return cancel("Setup aborted.");

    const PORT = 3001;
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

    const tempPath = path.join(process.cwd(), "github-setup.html");
    await writeFile(tempPath, htmlContent);

    log.step("GitHub App Configuration");
    log.message("Opening GitHub with your manifest...");
    if (!globalConfig.noOpen) {
      await open(tempPath);
    }

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

              await unlink(tempPath);

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
          }
        })
        .listen(PORT);
    });
  }

  private async setupOAuthApp(callbackUrl: string): Promise<void> {
    log.step("Step 1: Create OAuth App on GitHub");
    const oauthAppUrl = "https://github.com/settings/applications/new";
    log.message(`Opening: ${oauthAppUrl}`);
    if (!globalConfig.noOpen) {
      await open(oauthAppUrl);
    }
    note(
      "1. Fill Application Name and Homepage URL\n2. Enter Authorization callback URL: " +
        callbackUrl +
        "\n3. Click 'Register application'",
      "Action Required",
    );

    const brandDone = await text({
      message:
        "Press Enter once you've created the OAuth App (or type 'skip' if done previously)",
    });
    if (isCancel(brandDone)) return cancel("Setup aborted.");

    log.step("Step 2: Save credentials");
    const clientId = await text({
      message: "Paste your Client ID:",
      placeholder: "Iv1.xxx",
    });
    if (isCancel(clientId)) return cancel("Setup aborted.");

    const clientSecret = await password({
      message: "Paste your Client Secret:",
    });
    if (isCancel(clientSecret)) return cancel("Setup aborted.");

    const saveOption = await this.askSaveOption();
    if (isCancel(saveOption)) return cancel("Setup aborted.");

    await saveCredentials(
      clientId,
      clientSecret,
      "github",
      saveOption as SaveOption
    );
  }

  private async askSaveOption(): Promise<SaveOption | symbol> {
    return select<SaveOption>({
      message: "Where do you want to save the credentials?",
      options: [
        { label: ".env", value: "dot-env" },
        { label: ".env.local", value: "dot-env-dot-local" },
        { label: ".json", value: "json" },
        { label: "print to the console", value: "print" },
      ],
    });
  }
}

class Orchestrator {
  private projectName: string;

  constructor(projectName: string) {
    this.projectName = projectName;
  }

  async setupOAuthServices(oauthServices: string[]): Promise<void> {
    for (const service of oauthServices) {
      if (service === "google") {
        log.step("Google OAuth Setup");
        const googleOauthCallback = await text({
          message: "Enter the Google OAuth callback URL:",
          placeholder: "https://localhost:3000/oauth/callback/google",
          defaultValue: `http://localhost:3000/oauth/callback/google`,
        });
        if (isCancel(googleOauthCallback)) {
          cancel("Setup aborted.");
          return;
        }
        const googleProvider = new GoogleAuthProvider();
        await googleProvider.run(googleOauthCallback as string);
      } else if (service === "github") {
        log.step("GitHub OAuth Setup");
        const githubOauthCallback = await text({
          message: "Enter the GitHub OAuth callback URL:",
          placeholder: "http://localhost:3000/oauth/callback/github",
          defaultValue: `http://localhost:3000/oauth/callback/github`,
        });
        if (isCancel(githubOauthCallback)) {
          cancel("Setup aborted.");
          return;
        }
        const githubProvider = new GitHubAuthProvider();
        await githubProvider.run(githubOauthCallback as string);
      }
    }

    outro("OAuth setup completed! Thank you for using oauth-init client!");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    help: args.includes("--help") || args.includes("-h"),
    quiet: args.includes("--quiet") || args.includes("-q"),
    noOpen: args.includes("--no-open") || args.includes("-n"),
  };

  if (flags.help) {
    console.log(`
Usage: oauth-init [options]

Options:
  -h, --help     Show this help message
  -q, --quiet    Reduce output verbosity
  -n, --no-open  Don't open browser URLs automatically

Examples:
  oauth-init              # Run interactive setup
  oauth-init --quiet       # Run with minimal output
  oauth-init --no-open     # Get URLs but don't open them
`);
    process.exit(0);
  }

  globalConfig.quiet = flags.quiet;
  globalConfig.noOpen = flags.noOpen;

  const projectDirectoryName = path.basename(process.cwd());
  intro(`
  ▗▄▖  ▗▄▖ ▗▖ ▗▖▗▄▄▄▖▗▖ ▗▖    ▗▄▄▄▖▗▖  ▗▖▗▄▄▄▖▗▄▄▄▖
 ▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌  █  ▐▌ ▐▌      █  ▐▛▚▖▐▌  █    █
 ▐▌ ▐▌▐▛▀▜▌▐▌ ▐▌  █  ▐▛▀▜▌      █  ▐▌ ▝▜▌  █    █
 ▝▚▄▞▘▐▌ ▐▌▝▚▄▞▘  █  ▐▌ ▐▌    ▗▄█▄▖▐▌  ▐▌▗▄█▄▖  █ `);

  const projectName = await text({
    message: "Enter the name of your project:",
    placeholder: projectDirectoryName,
    defaultValue: projectDirectoryName,
  });

  if (isCancel(projectName)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  const oauthToSetup = await multiselect({
    message: "Select OAuth services to setup:",
    options: [
      { value: "google", label: "Google" },
      { value: "github", label: "Github" },
    ],
  });

  if (isCancel(oauthToSetup)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  const orchestrator = new Orchestrator(
    projectName as string,
  );
  await orchestrator.setupOAuthServices(oauthToSetup as string[]);
  process.exit(0);
}

main();
