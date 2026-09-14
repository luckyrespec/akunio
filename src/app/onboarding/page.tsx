import { redirect } from "next/navigation";
import { requireVerifiedSession } from "@/server/auth/guard";
import { withOrg } from "@/server/db/repos/with-org";
import { getOnboardingView } from "@/server/onboarding/engine";
import { OnboardingChatClient } from "./onboarding-chat-client";

// Auth-gated: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  // NOTE: no .catch() here — redirect() throws NEXT_REDIRECT and must
  // propagate (unverified → /verifikasi, anonymous → /masuk).
  const ctx = await requireVerifiedSession();
  const view = await withOrg(ctx.orgId, (tx) => getOnboardingView(tx, ctx.orgId));
  if (view.profile?.status === "COMPLETED") redirect("/dasbor");
  return (
    <OnboardingChatClient
      initialMessages={view.messages}
      initialStep={view.profile?.currentStep ?? "NAMA"}
      initialSteps={view.steps}
      initialPreview={view.coaPreview}
      initialChips={view.chips}
      initialBusinessName={view.profile?.businessName ?? null}
    />
  );
}
