import { execa } from "execa";
import { log, spinner, select, text, password, isCancel, cancel, note, confirm } from "@clack/prompts";
import open from "open";
import { OAuthProvider, SaveOption } from "../../types.js";
import { saveCredentials } from "../save-credentials.js";
import { askSaveOption } from "../ask-save-option.js";
import { globalConfig } from "../config.js";

function logStep(message: string) {
  if (!globalConfig.quiet) log.step(message);
}

function logInfo(message: string) {
  if (!globalConfig.quiet) log.info(message);
}

function logMessage(message: string) {
  if (!globalConfig.quiet) log.message(message);
}

async function checkVercelCLI(): Promise<boolean> {
  const s = spinner();
  s.start("Checking Vercel CLI...");

  try {
    await execa("vercel", ["--version"]);
  } catch {
    s.stop("Vercel CLI not found.");
    log.error(
      "Vercel CLI is required for Vercel OAuth setup.\n" +
      "Install it: npm i -g vercel\n" +
      "Then run: vercel login"
    );
    return false;
  }

  s.stop("Vercel CLI found.");
  return true;
}

async function checkVercelAuth(): Promise<{ authenticated: boolean; user?: string }> {
  const authSpinner = spinner();
  authSpinner.start("Checking Vercel authentication...");

  try {
    const { stdout } = await execa("vercel", ["whoami"]);

    if (!stdout.trim()) {
      authSpinner.stop("Not authenticated.");
      return { authenticated: false };
    }

    authSpinner.stop(`Logged in as: ${stdout.trim()}`);
    return { authenticated: true, user: stdout.trim() };
  } catch {
    authSpinner.stop("Not authenticated.");
    return { authenticated: false };
  }
}

async function getVercelTeams(): Promise<{ name: string; slug: string }[]> {
  const loadingSpinner = spinner();
  loadingSpinner.start("Fetching Vercel teams...");
  try {
    const { stdout, stderr } = await execa("vercel", ["teams", "ls", "--format", "json"]);
    const teamsJson = JSON.parse(stdout);
    console.log(teamsJson);

    const teams = teamsJson.teams.map((team: any) => ({
      name: team.name,
      slug: team.slug,
    }));

    loadingSpinner.stop("Fetched teams.");
    return teams;
  } catch (stderr) {
    loadingSpinner.stop("No teams found or not a team member. " + stderr);
    return [];
  }
}

export class VercelAuthProvider implements OAuthProvider {
  async run(_appName: string) {
    try {
      const isCLIInstalled = await checkVercelCLI();
      if (!isCLIInstalled) {
        log.error("Please install Vercel CLI and authenticate before continuing.");
        process.exit(1);
      }

      const auth = await checkVercelAuth();
      if (!auth.authenticated) {
        log.error("Please run: vercel login");
        process.exit(1);
      }

      const teams = await getVercelTeams();


      let selectedTeam: { name: string; slug: string };

      if (teams.length === 0) {
        log.error("No teams found. Please ensure you have a Vercel team or personal account.");
        process.exit(1);
      } else if (teams.length === 1) {
        selectedTeam = teams[0];
        logInfo(`Using team: ${selectedTeam.name}`);
      } else {
        const teamId = await select({
          message: "Select your team",
          options: teams.map((team) => ({
            label: team.name,
            value: team.slug,
          })),
        });
        selectedTeam = { name: teamId as string, slug: teamId as string };
      }

      const teamSlug = selectedTeam.slug;
      const appsUrl = teamSlug
        ? `https://vercel.com/${teamSlug}/~/settings/apps/create`
        : `https://vercel.com/settings/apps`;

      logStep("Step 1: Create Vercel OAuth App");

      logMessage("Create an App in your Vercel dashboard to get OAuth credentials.");

      note(
        `Required Authorization Callback URL:\n${_appName}`,
        "Save this URL"
      );

      if (!globalConfig.noOpen) {
        const shouldOpen = globalConfig.skipPrompts ? true : await confirm({
          message: "Open Vercel Apps settings page?",
          initialValue: true,
        });
        if (isCancel(shouldOpen)) return cancel("Setup aborted.");
        if (shouldOpen) await open(appsUrl);
      }

      if (!globalConfig.skipPrompts) {
        note(
          `1. Go to ${appsUrl}\n2. Click 'Create' to create a new App\n3. Enter Name and Slug for your app\n4. Configure Authorization Callback URL (use the URL above)\n5. Choose client authentication method\n6. Click Save\n7. Scroll to Client Secrets and click Generate`,
          "Action Required"
        );

        await text({
          message:
            "Press Enter once you've created the app and generated a client secret (or type 'skip' if done previously)",
        });
      }

      logStep("Step 2: Enter Vercel OAuth Credentials");

      let clientId: string | symbol;
      let clientSecret: string | symbol;

      if (globalConfig.skipPrompts) {
        log.error("Client ID and Secret required in non-interactive mode. Run without --skip-prompts");
        process.exit(1);
      }

      clientId = await text({
        message: "Paste your Vercel Client ID:",
        placeholder: "your_client_id",
        validate: (value) =>
          value && value.length > 0 ? undefined : "Client ID is required",
      });
      if (isCancel(clientId)) return cancel("Setup aborted.");

      clientSecret = await password({
        message: "Paste your Vercel Client Secret:",
      });
      if (isCancel(clientSecret)) return cancel("Setup aborted.");

      logStep("Step 3: Save credentials");
      const saveOption = await askSaveOption();
      if (isCancel(saveOption)) return cancel("Setup aborted.");

      await saveCredentials(
        clientId,
        clientSecret,
        "vercel",
        saveOption as SaveOption
      );
    } catch (err: any) {
      log.error(`Setup Failed: ${err.message}`);
      process.exit(1);
    }
  }
}
