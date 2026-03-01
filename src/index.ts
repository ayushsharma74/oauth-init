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
import { GoogleAuthProvider } from "./lib/google-provider.js";
import { GitHubAuthProvider } from "./lib/github-provider.js";
import { globalConfig } from "./lib/config.js";

async function setupOAuthServices(oauthServices: string[]): Promise<void> {
  for (const service of oauthServices) {
    if (service === "google") {
      log.step("Google OAuth Setup");
      const googleOauthCallback = await text({
        message: "Enter the Google OAuth callback URL:",
        placeholder: "http://localhost:3000/oauth/callback/google",
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
