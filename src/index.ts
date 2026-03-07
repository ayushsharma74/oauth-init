#!/usr/bin/env node
import {
  intro,
  outro,
  log,
  text,
  isCancel,
  cancel,
  multiselect,
} from "@clack/prompts";
import path from "path";
import fs from "fs";
import { GoogleAuthProvider } from "./lib/providers/google.js";
import { GitHubAuthProvider } from "./lib/providers/github.js";
import { DiscordAuthProvider } from "./lib/providers/discord.js";
import { GitLabAuthProvider } from "./lib/providers/gitlab.js";
import { VercelAuthProvider } from "./lib/providers/vercel.js";
import { globalConfig } from "./lib/config.js";

interface AuthLibrary {
  name: string;
  callbackPattern: string;
}

const AUTH_LIBRARIES: AuthLibrary[] = [
  { name: "next-auth", callbackPattern: "/api/auth/callback/[provider]" },
  { name: "@auth/core", callbackPattern: "/api/auth/callback/[provider]" },
  { name: "better-auth", callbackPattern: "/api/auth/callback/[provider]" },
  { name: "lucia", callbackPattern: "/auth/callback" },
  { name: "arctic", callbackPattern: "/auth/callback/[provider]" },
  { name: "iron-session", callbackPattern: "/api/auth/callback" },
];

function detectAuthLibrary(): AuthLibrary | null {
  const packageJsonPath = path.join(process.cwd(), "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const lib of AUTH_LIBRARIES) {
      if (deps[lib.name]) {
        return lib;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function getCallbackUrlPattern(authLibrary: AuthLibrary | null): string {
  if (authLibrary) {
    return authLibrary.callbackPattern;
  }
  return "/oauth/callback/[provider]";
}

const DEFAULT_CALLBACK_URL = "http://localhost:3000";

const PROVIDER_HELP: Record<string, string> = {
  google: `
Google OAuth Setup:
  1. Requires a Google Cloud project with OAuth 2.0 configured
  2. Redirect URI: http://localhost:3000/api/auth/callback/google
  3. Need: Client ID and Client Secret from Google Cloud Console
  4. Run: gcloud auth login before starting`,
  github: `
GitHub OAuth Setup:
  1. Creates OAuth App or GitHub App in your org
  2. Redirect URI: http://localhost:3000/api/auth/callback/github
  3. Need: Client ID and Client Secret from GitHub Developer Settings`,
  discord: `
Discord OAuth Setup:
  1. Requires Discord Developer Portal setup
  2. Redirect URI: http://localhost:3000/api/auth/callback/discord
  3. Need: Client ID and Client Secret from Discord Developer Portal`,
  gitlab: `
GitLab OAuth Setup:
  1. Requires GitLab.com or GitLab Self-Managed
  2. Redirect URI: http://localhost:3000/api/auth/callback/gitlab
  3. Need: Application ID and Client Secret from GitLab Applications
  4. Supports user-owned, group-owned, or instance-wide apps`,
  vercel: `
Vercel OAuth Setup:
  1. Uses Vercel CLI to list your teams and open the correct settings page
  2. Requires: npm i -g vercel and vercel login
  3. Configure Authorization Callback URL: http://localhost:3000/api/auth/callback/vercel
  4. Generate a Client Secret in your app settings
  5. Get the Client ID from your app settings
  6. For better-auth: https://www.better-auth.com/docs/plugins/oauth#vercel`,
};

function showProviderHelp(provider: string) {
  const help = PROVIDER_HELP[provider.toLowerCase()];
  if (help) {
    console.log(help);
    process.exit(0);
  }
  console.log(`Unknown provider: ${provider}`);
  console.log(`Available: ${Object.keys(PROVIDER_HELP).join(", ")}`);
  process.exit(1);
}

async function setupOAuthServices(oauthServices: string[], customCallbackUrl?: string): Promise<void> {
  const authLibrary = detectAuthLibrary();
  const callbackPattern = getCallbackUrlPattern(authLibrary);

  if (authLibrary) {
    log.info(`Detected auth library: ${authLibrary.name}`);
  } else {
    log.info("No known auth library detected, using generic callback pattern");
  }

  const baseCallbackUrl = customCallbackUrl || DEFAULT_CALLBACK_URL;

  for (const service of oauthServices) {
    const providerCallback = callbackPattern.replace(
      "[provider]",
      service
    );
    const defaultCallback = `${baseCallbackUrl}${providerCallback}`;

    if (service === "google") {
      log.step("Google OAuth Setup");
      const googleOauthCallback = globalConfig.skipPrompts
        ? defaultCallback
        : await text({
            message: "Enter the Google OAuth callback URL:",
            placeholder: defaultCallback,
            defaultValue: defaultCallback,
          });
      if (isCancel(googleOauthCallback)) {
        cancel("Setup aborted.");
        return;
      }
      const googleProvider = new GoogleAuthProvider();
      await googleProvider.run(googleOauthCallback as string);
    } else if (service === "github") {
      log.step("GitHub OAuth Setup");
      const githubOauthCallback = globalConfig.skipPrompts
        ? defaultCallback
        : await text({
            message: "Enter the GitHub OAuth callback URL:",
            placeholder: defaultCallback,
            defaultValue: defaultCallback,
          });
      if (isCancel(githubOauthCallback)) {
        cancel("Setup aborted.");
        return;
      }
      const githubProvider = new GitHubAuthProvider();
      await githubProvider.run(githubOauthCallback as string);
    } else if (service === "discord") {
      log.step("Discord OAuth Setup");
      const discordOauthCallback = globalConfig.skipPrompts
        ? defaultCallback
        : await text({
            message: "Enter the Discord OAuth callback URL:",
            placeholder: defaultCallback,
            defaultValue: defaultCallback,
          });
      if (isCancel(discordOauthCallback)) {
        cancel("Setup aborted.");
        return;
      }
      const discordProvider = new DiscordAuthProvider();
      await discordProvider.run(discordOauthCallback as string);
    } else if (service === "gitlab") {
      log.step("GitLab OAuth Setup");
      const gitlabOauthCallback = globalConfig.skipPrompts
        ? defaultCallback
        : await text({
            message: "Enter the GitLab OAuth callback URL:",
            placeholder: defaultCallback,
            defaultValue: defaultCallback,
          });
      if (isCancel(gitlabOauthCallback)) {
        cancel("Setup aborted.");
        return;
      }
      const gitlabProvider = new GitLabAuthProvider();
      await gitlabProvider.run(gitlabOauthCallback as string);
    } else if (service === "vercel") {
      log.step("Vercel OAuth Setup");
      const vercelOauthCallback = globalConfig.skipPrompts
        ? defaultCallback
        : await text({
            message: "Enter the Vercel OAuth callback URL:",
            placeholder: defaultCallback,
            defaultValue: defaultCallback,
          });
      if (isCancel(vercelOauthCallback)) {
        cancel("Setup aborted.");
        return;
      }
      const vercelProvider = new VercelAuthProvider();
      await vercelProvider.run(vercelOauthCallback as string);
    }
  }

  outro("OAuth setup completed! Thank you for using oauth-init!");
}

async function main() {
  const args = process.argv.slice(2);
  const flags = {
    help: args.includes("--help") || args.includes("-h"),
    quiet: args.includes("--quiet") || args.includes("-q"),
    noOpen: args.includes("--no-open") || args.includes("-n"),
    skipPrompts: args.includes("--skip-prompts") || args.includes("-y"),
    provider: args.find((arg) => arg.startsWith("--provider="))?.split("=")[1] ||
      args.find((arg) => arg.startsWith("-p="))?.split("=")[1],
    callbackUrl: args.find((arg) => arg.startsWith("--callback-url="))?.split("=")[1] ||
      args.find((arg) => arg.startsWith("-c="))?.split("=")[1],
  };

  const providerArg = args.find((arg) => !arg.startsWith("-"));
  if (providerArg && (providerArg === "google" || providerArg === "github" || providerArg === "discord" || providerArg === "gitlab" || providerArg === "vercel")) {
    showProviderHelp(providerArg);
  }

  if (flags.help) {
    console.log(`
Usage: oauth-init [options] [provider]

Options:
  -h, --help             Show this help message
  -q, --quiet            Reduce output verbosity
  -n, --no-open          Don't open browser URLs automatically
  -y, --skip-prompts     Use default options (for CI/CD)
  -p, --provider=        Specify providers (comma-separated): google,github,discord,gitlab,vercel
  -c, --callback-url=   Base callback URL (default: http://localhost:3000)

Examples:
  oauth-init                        # Run interactive setup
  oauth-init --provider=google      # Setup only Google
  oauth-init --provider=google,github  # Setup Google and GitHub
  oauth-init --no-open              # Get URLs but don't open them
  oauth-init --quiet -y             # Minimal output, use defaults
  oauth-init -y -p google -c https://myapp.com  # CI/CD mode
  oauth-init google                 # Show Google-specific help
`);
    process.exit(0);
  }

  if (flags.provider) {
    const validProviders = ["google", "github", "discord", "gitlab", "vercel"];
    const providers = flags.provider.split(",").map((p) => p.trim().toLowerCase());
    const invalid = providers.filter((p) => !validProviders.includes(p));
    if (invalid.length > 0) {
      console.error(`Invalid providers: ${invalid.join(", ")}. Valid: ${validProviders.join(", ")}`);
      process.exit(1);
    }
  }

  globalConfig.quiet = flags.quiet;
  globalConfig.noOpen = flags.noOpen;
  globalConfig.skipPrompts = flags.skipPrompts;

  const projectDirectoryName = path.basename(process.cwd());

  if (!flags.quiet) {
    intro(`
  ▗▄▖  ▗▄▖ ▗▖ ▗▖▗▄▄▄▖▗▖ ▗▖    ▗▄▄▄▖▗▖  ▗▖▗▄▄▄▖▗▄▄▄▖
 ▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌  █  ▐▌ ▐▌      █  ▐▛▚▖▐▌  █    █
 ▐▌ ▐▌▐▛▀▜▌▐▌ ▐▌  █  ▐▛▀▜▌      █  ▐▌ ▝▜▌  █    █
 ▝▚▄▞▘▐▌ ▐▌▝▚▄▞▘  █  ▐▌ ▐▌    ▗▄█▄▖▐▌  ▐▌▗▄█▄▖  █ `);
  }

  let projectName: string | symbol;
  if (flags.skipPrompts) {
    projectName = projectDirectoryName;
  } else {
    projectName = await text({
      message: "Enter the name of your project:",
      placeholder: projectDirectoryName,
      defaultValue: projectDirectoryName,
    });

    if (isCancel(projectName)) {
      cancel("Operation cancelled.");
      process.exit(0);
    }
  }

  let oauthToSetup: string[] | symbol;
  if (flags.provider) {
    oauthToSetup = flags.provider.split(",").map((p) => p.trim().toLowerCase());
  } else {
    oauthToSetup = await multiselect({
      message: "Select OAuth services to setup:",
      options: [
        { value: "google", label: "Google" },
        { value: "github", label: "Github" },
        { value: "discord", label: "Discord" },
        { value: "gitlab", label: "GitLab" },
        { value: "vercel", label: "Vercel" },
        { value: "microsoft", label: "Microsoft", disabled: true, hint: "Coming soon" }
      ],
    });

    if (isCancel(oauthToSetup)) {
      cancel("Operation cancelled.");
      process.exit(0);
    }
    oauthToSetup = oauthToSetup as string[];
  }

  await setupOAuthServices(oauthToSetup, flags.callbackUrl);
  process.exit(0);
}

main();
