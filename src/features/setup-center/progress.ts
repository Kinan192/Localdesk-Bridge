/** Pure presentation logic. 'configured' is NEVER a claim of AI tool connectivity. */
export type StepState = "configured" | "pending" | "review" | "verify-in-client";

type ProgressInput = {
  systemReady?: boolean;
  approvedFolders?: number;
  credentialAvailable?: boolean;
  deploymentPhase?: string;
  mcpConfigured?: boolean;
  mcpProtected?: boolean;
  tunnelManagedRunning?: boolean;
};

export function setupStepStates({
  systemReady = false,
  approvedFolders = 0,
  credentialAvailable = false,
  deploymentPhase = "not-started",
  mcpConfigured = false,
  mcpProtected = false,
  tunnelManagedRunning = false,
}: ProgressInput = {}): StepState[] {
  const published = deploymentPhase === "published";
  return [
    systemReady ? "configured" : "review",
    approvedFolders > 0 ? "configured" : "pending",
    credentialAvailable ? "configured" : "review",
    published ? "configured" : "pending",
    mcpConfigured ? "configured" : "pending",
    published ? "review" : "pending",
    mcpProtected && tunnelManagedRunning ? "configured" : "pending",
    "verify-in-client",
  ];
}

export function configuredStepCount(states: readonly StepState[]): number {
  return states.filter(state => state === "configured").length;
}
