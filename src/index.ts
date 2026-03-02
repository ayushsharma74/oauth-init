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
import { GoogleAuthProvider } from "./lib/providers/google-provider.js";
import { GitHubAuthProvider } from "./lib/providers/github-provider.js";
import { globalConfig } from "./lib/config.js";
import { DiscordAuthProvider } from "./lib/providers/discord-provider.js";

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

async function setupOAuthServices(oauthServices: string[]): Promise<void> {
  const authLibrary = detectAuthLibrary();
  const callbackPattern = getCallbackUrlPattern(authLibrary);

  if (authLibrary) {
    log.info(`Detected auth library: ${authLibrary.name}`);
  } else {
    log.info("No known auth library detected, using generic callback pattern");
  }

  for (const service of oauthServices) {
    const providerCallback = callbackPattern.replace(
      "[provider]",
      service
    );
    const defaultCallback = `${DEFAULT_CALLBACK_URL}${providerCallback}`;

    if (service === "google") {
      log.step("Google OAuth Setup");
      const googleOauthCallback = await text({
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
      const githubOauthCallback = await text({
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
      const discordOauthCallback = await text({
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
      { value: "discord", label: "Discord" },
    ],
  });

  if (isCancel(oauthToSetup)) {
    cancel("Operation cancelled.");
    process.exit(0);
  }

  await setupOAuthServices(oauthToSetup as string[]);
  process.exit(0);
}

main();
