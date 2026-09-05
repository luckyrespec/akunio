import { redirect } from "next/navigation";
import { requireVerifiedSession } from "@/server/auth/guard";
import { db } from "@/server/db";
import { getOnboardingView } from "@/server/onboarding/engine";
import { OnboardingChatClient } from "./onboarding-chat-client";

// Auth-gated: must render dynamically (session lives in cookies).
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  // NOTE: no .catch() here — redirect() throws NEXT_REDIRECT and must
  // propagate (unverified → /verifikasi, anonymous → /masuk).
  const ctx = await requireVerifiedSession();
  const view = await getOnboardingView(db, ctx.orgId);
  if (view.profile?.status === "COMPLETED") redirect("/dasbor");
  return (
    <OnboardingChatClient
      initialMessages={view.messages}
      initialStep={view.profile?.currentStep ?? "NAMA"}
      initialPreview={view.coaPreview}
      initialChips={view.chips}
      initialBusinessName={view.profile?.businessName ?? null}
    />
  );
}
