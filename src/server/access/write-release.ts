import { writeBackendAvailable } from "../files/secure-write.ts";

/**
 * Write is opt-in for an explicitly approved folder and requires a working
 * platform worker (bubblewrap on Linux, scoped filesystem worker on Windows).
 * Unsupported hosts remain Read Only.
 */
export const WRITE_RELEASE_BLOCKERS = [
  "platform-file-write-safety-worker-unavailable",
  "delete-requires-independent-local-owner-approval",
] as const;

export type WriteReleaseStatus = {
  available: boolean;
  mode: "read-only" | "read-write";
  stage: "M3-folder-permissions";
  blockers: readonly string[];
  tools: readonly string[];
};

export function writeReleaseStatus(): WriteReleaseStatus {
  const available = writeBackendAvailable();
  return {
    available,
    mode: available ? "read-write" : "read-only",
    stage: "M3-folder-permissions",
    blockers: available ? [] : [...WRITE_RELEASE_BLOCKERS],
    tools: available ? ["create_directory", "write_file", "edit_file", "rename_file", "delete_file"] : [],
  };
}

