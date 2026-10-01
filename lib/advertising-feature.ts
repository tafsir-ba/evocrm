/**
 * Growth Copilot / advertising module feature flag.
 * Defaults OFF. Enable only via explicit env for pilot workspaces.
 * Server routes must call assertAdvertisingEnabled() — UI hiding is not enough.
 */
export function isAdvertisingEnabled(): boolean {
  const raw = process.env.ADVERTISING_ENABLED?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

/** Compile-time / docs default — always false unless env overrides at runtime. */
export const ADVERTISING_ENABLED_DEFAULT = false;
