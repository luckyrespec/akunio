import { NavbarV3 } from "./navbar-v3";
import { HeroVideoScrub } from "./hero-video-scrub";
import { InteractiveSimulator } from "./interactive-simulator";
import { PainKillersV3 } from "./pain-killers-v3";
import { LevelUpLadderV3 } from "./level-up-ladder-v3";
import { BankableReportPreview } from "./bankable-report-preview";
import { LoanReadinessCalculator } from "./loan-readiness-calculator";
import { PricingV3 } from "./pricing-v3";
import { FaqV3 } from "./faq-v3";
import { FinalCtaV3 } from "./final-cta-v3";
import { FooterV3 } from "./footer-v3";

export function LandingPageV3({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
  return (
    <div className="min-h-screen bg-canvas text-ink flex flex-col font-sans selection:bg-terra/20 selection:text-terra">
      <NavbarV3 isLoggedIn={isLoggedIn} />
      <main className="flex-1">
        <HeroVideoScrub />
        <InteractiveSimulator />
        <PainKillersV3 />
        <LevelUpLadderV3 />
        <BankableReportPreview />
        <LoanReadinessCalculator />
        <PricingV3 />
        <FaqV3 />
        <FinalCtaV3 />
      </main>
      <FooterV3 />
    </div>
  );
}
