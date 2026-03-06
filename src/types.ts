export type SaveOption = "dot-env" | "dot-env-dot-local" | "json" | "print";

export interface OAuthProvider {
  run(callbackUrl: string): Promise<void>;
}

export type Provider = "google" | "github" | "discord";