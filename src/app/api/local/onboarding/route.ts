import { NextRequest } from "next/server";
import { ensureOwnerRequest, readJsonSmall, respond, respondError } from "@/server/http/local-only";
import { getOnboardingSystemCheck, OnboardingRepository } from "@/server/onboarding/index.ts";
import { getPolicy } from "@/server/http/local-policy.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  // P1D: block unpaired requests from accessing local metadata.
  const denied = await ensureOwnerRequest(request);
  if (denied) return denied;
  try {
    const storage = new OnboardingRepository();
    const [onboarding, system, policy] = await Promise.all([
      storage.load(), getOnboardingSystemCheck(), getPolicy(),
    ]);
    return respond({
      onboarding, system,
      fileAccess: {
        approvedRoots: policy.roots.filter(root => root.enabled).length,
        readTools: ["list_roots", "list_files", "read_file", "search_files", "file_info"]
          .filter(tool => policy.tools[tool as keyof typeof policy.tools]).length,
      },
    });
  } catch (error) { return respondError(error); }
}

export async function PATCH(request: NextRequest) {
  const denied = await ensureOwnerRequest(request, true);
  if (denied) return denied;
  try {
    const onboarding = await new OnboardingRepository().patch(await readJsonSmall(request));
    return respond({ onboarding });
  } catch (error) { return respondError(error); }
}
