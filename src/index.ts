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
import { Command } from "commander";
import open from "open";
import { writeFile, access, readFile, unlink, stat } from "fs/promises";
import path from "path";
import http from "http";

export class GoogleAuthProvider {
  async run(appName: string) {
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

      await open(brandUrl);
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

      await open(clientUrl);
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

      // HERE
      log.step("Step 3: Save credentials to a file");
      const saveOption = await select({
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
      const envPath = saveOption === "dot-env" ? ".env" : ".env.local";
      const newEnvContent = `GOOGLE_CLIENT_ID=${clientId}\nGOOGLE_CLIENT_SECRET=${clientSecret}`;
      try {
        await access(envPath);
        const existingContent = await readFile(envPath, "utf-8");
        await writeFile(envPath, existingContent + "\n" + newEnvContent);
      } catch {
        await writeFile(envPath, newEnvContent);
      }
      // 5. Final Validation
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }

  /**
   * Pings Google's tokeninfo endpoint to verify the Client ID exists
   */
  private async validateCredentials(clientId: string): Promise<boolean> {
    const s = spinner();
    s.start("Verifying Client ID with Google...");
    try {
      // This public endpoint lets us verify a Client ID without a secret
      const res = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?client_id=${clientId}`,
      );
      s.stop("Client ID verified.");
      return res.status !== 400;
    } catch {
      s.stop("Validation service unreachable.");
      return false;
    }
  }
}

const program = new Command();

async function checkNpmReadiness() {
  intro("Checking if your project is ready for npm publish...");

  const packageJsonPath = path.join(process.cwd(), "package.json");
  let pkg: any;

  try {
    const pkgContent = await readFile(packageJsonPath, "utf-8");
    pkg = JSON.parse(pkgContent);
  } catch {
    log.error("No package.json found in current directory.");
    process.exit(1);
  }

  const checks: { name: string; passed: boolean; message: string }[] = [];

  const name = pkg.name || "";
  const validName = /^[a-z0-9-@/]+$/.test(name) && !name.includes(" ");
  checks.push({
    name: "package.json: name (lowercase, no spaces)",
    passed: validName,
    message: validName ? `Valid: ${name}` : `Invalid: "${name}"`,
  });

  const version = pkg.version || "";
  const validVersion = /^\d+\.\d+\.\d+(-[a-z0-9.-]+)?$/.test(version);
  checks.push({
    name: "package.json: version (semver)",
    passed: validVersion,
    message: validVersion ? `Valid: ${version}` : `Invalid: "${version}"`,
  });

  checks.push({
    name: "package.json: description",
    passed: !!pkg.description,
    message: pkg.description || "Missing",
  });

  checks.push({
    name: "package.json: license",
    passed: !!pkg.license,
    message: pkg.license || "Missing",
  });

  checks.push({
    name: "package.json: main or exports",
    passed: !!(pkg.main || pkg.exports),
    message: pkg.main || pkg.exports || "Missing",
  });

  checks.push({
    name: "package.json: not private",
    passed: pkg.private !== true,
    message: pkg.private === true ? "Set to private: true" : "OK",
  });

  const hasReadme = await fileExists(path.join(process.cwd(), "README.md"));
  checks.push({
    name: "README.md exists",
    passed: hasReadme,
    message: hasReadme ? "Found" : "Missing",
  });

  const hasLicense = await fileExists(path.join(process.cwd(), "LICENSE")) ||
                     await fileExists(path.join(process.cwd(), "LICENSE.md"));
  checks.push({
    name: "LICENSE file exists",
    passed: hasLicense,
    message: hasLicense ? "Found" : "Missing",
  });

  const hasDist = await fileExists(path.join(process.cwd(), "dist"));
  checks.push({
    name: "dist/ folder exists (built)",
    passed: hasDist,
    message: hasDist ? "Found" : "Missing - run 'npm run build' or 'bun run build'",
  });

  const hasNpmIgnore = await fileExists(path.join(process.cwd(), ".npmignore"));
  const hasFilesField = !!pkg.files;
  checks.push({
    name: ".npmignore or files field",
    passed: hasNpmIgnore || hasFilesField,
    message: hasNpmIgnore ? ".npmignore found" : hasFilesField ? `files: ${pkg.files.join(", ")}` : "Missing",
  });

  let hasGitRemote = false;
  try {
    await execa("git", ["remote", "get-url", "origin"], { stdio: "ignore" });
    hasGitRemote = true;
  } catch {}
  checks.push({
    name: "Git remote configured",
    passed: hasGitRemote,
    message: hasGitRemote ? "origin remote set" : "Not configured",
  });

  const hasTests = await fileExists(path.join(process.cwd(), "test")) ||
                   await fileExists(path.join(process.cwd(), "tests")) ||
                   await fileExists(path.join(process.cwd(), "__tests__"));
  checks.push({
    name: "Has tests folder",
    passed: hasTests,
    message: hasTests ? "Found" : "Not found (optional)",
  });

  log.step("\n📦 NPM Readiness Report\n");

  let passed = 0;
  let failed = 0;

  for (const check of checks) {
    if (check.passed) {
      log.success(`${check.name}: ${check.message}`);
      passed++;
    } else {
      log.error(`${check.name}: ${check.message}`);
      failed++;
    }
  }

  log.message(`\n${passed} passed, ${failed} failed`);

  if (failed === 0) {
    log.success("\n✅ Your project is ready for npm publish!");
    note(`\nTo publish:
  1. npm login
  2. npm publish
  \nOr for scoped packages:
  npm publish --access public`, "Next steps");
  } else {
    log.warning("\n⚠️  Fix the failed checks before publishing.");
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

class Orchestrator {
  private projectname: string 
  
  constructor(proejctName: string) {
    this.projectname = proejctName
  }
  async setupOAuthServices(oauthServices: string[]): Promise<void> {
    for (const service of oauthServices) {
      if (service === "google") {
        log.step("Google Oauth Setup");
        const googleOauthCallback = await text({
          message: "Enter the Google OAuth callback URL:",
          placeholder: "https://example.com/oauth/callback",
          defaultValue: `http://localhost:3000/oauth/callback/google`,
        });
        await this.setupGoogleOAuth(googleOauthCallback.toString());
      } else if (service === "github") {
        log.step("Github Oauth Setup");
        const githubOauthCallback = await text({
          message: "Enter the Github OAuth callback URL:",
          placeholder: "https://example.com/oauth/callback",
          defaultValue: `http://localhost:3000/oauth/callback/github`,
        });
        await this.setupGithubOAuth(githubOauthCallback.toString());
      }
    }
    
    outro("OAuth setup completed! Thank you for using oauth-init client!");
  }

  private async setupGoogleOAuth(callbackUrl: string): Promise<void> {
    const googleAuthProvider = new GoogleAuthProvider();
    await googleAuthProvider.run(callbackUrl);
  }

  private async setupGithubOAuth(callbackUrl: string): Promise<void> {
    const appType = await select({
      message: "What type of github app you want to create?",
      options: [
        {
          value: "gh-app",
          label: "Github App (One click setup)",
        },
        {
          value: "oauth-app",
          label: "OAuth App (You need to fill a form for this)",
        },
      ],
    });

    if (appType === "gh-app") {
      const PORT = 3001;
      const REDIRECT_URI = `http://localhost:${PORT}/callback`;

      const manifest = {
        name: "superblogger",
        url: "http://localhost:3000",
        callback_url: callbackUrl,
        public: false,
        default_permissions: {
          contents: "read",
          metadata: "read",
        },
        redirect_url: REDIRECT_URI,
      };

      // 1. Create a temporary HTML file to auto-submit the POST request
      // This bypasses URL length limits and ensures GitHub parses the JSON correctly
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
      await open(tempPath);
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
                // 3. Exchange the code for actual credentials
                const { stdout } = await execa("curl", [
                  "-X",
                  "POST",
                  `https://api.github.com/app-manifests/${code}/conversions`,
                ]);

                const credentials = JSON.parse(stdout);
                const { client_id, client_secret } = credentials;

                s.stop("Credentials received!");

                // Clean up temp file
                await unlink(tempPath);

                // Final Step: Save to .env (Reusing your logic)
                const newEnvContent = `GITHUB_CLIENT_ID=${client_id}\nGITHUB_CLIENT_SECRET=${client_secret}\n`;
                await writeFile(".env", newEnvContent, { flag: "a" });

                log.success("GitHub credentials saved to .env");
                server.close();
                resolve();
              } catch (err) {
                s.error("Failed to convert manifest code.");
                server.close();
                resolve();
              }
            }
          })
          .listen(PORT);
      });
    }

    if (appType === "oauth-app") {
      log.warning("FUCK YOU");
    }
  }
}

async function main() {
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

  const orchestrator = new Orchestrator(projectName as string).setupOAuthServices(oauthToSetup as string[]);
}

program
  .name("oauth-init")
  .description("Set up OAuth providers for your project")
  .version("0.1.0");

program
  .command("check")
  .description("Check if your project is ready for npm publish")
  .action(checkNpmReadiness);

program
  .action(main);

program.parse();
