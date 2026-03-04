import { select, isCancel, cancel } from "@clack/prompts";
import { SaveOption } from "../types.js";
import { globalConfig } from "./config.js";

export async function askSaveOption(): Promise<SaveOption | symbol> {
  if (globalConfig.skipPrompts) {
    return "dot-env";
  }

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
