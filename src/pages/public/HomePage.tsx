import HeroSection from "../../components/home/HeroSection";
import QuickAccess from "../../components/home/QuickAccess";
import { AboutSection, VillageSection } from "../../components/home/AboutVillageSections";
import TeamPreview from "../../components/home/TeamPreview";
import MatchesPreview from "../../components/home/MatchesPreview";
import { NewsPreview } from "../../components/home/NewsGallerySections";
import {
  ContactSection,
  FinancePreview,
  MembersPreview,
} from "../../components/home/FinanceMembersContactSections";
import { useHomeSections } from "../../hooks/useHomeSections";
import { useHomepageData } from "../../hooks/useHomepageData";
import { editedSectionTitle, type HomeSectionConfig } from "../../config/homepage";

/**
 * Homepage — Phase 4.
 * Sections render in the order / visibility set by the section config
 * (Admin-managed `home_sections` table once Supabase is connected;
 * `src/config/homepage.ts` defaults until then). All data-driven
 * sections show only real published content, or an honest empty state.
 */
export default function HomePage() {
  const { sections, hero } = useHomeSections();
  const data = useHomepageData();

  const renderSection = (section: HomeSectionConfig) => {
    const key = section.key;
    // v180 A1: the Admin-edited section title (when the owner has
    // actually edited it) replaces the section's built-in heading;
    // otherwise the component renders its usual heading unchanged.
    const headingTitle = editedSectionTitle(section);
    switch (key) {
      case "hero":
        return (
          <div key={key}>
            <HeroSection hero={hero} />
            <QuickAccess />
          </div>
        );
      case "about":
        return <AboutSection key={key} headingTitle={headingTitle} />;
      case "village":
        return <VillageSection key={key} headingTitle={headingTitle} />;
      case "football":
        return <TeamPreview key={key} sport="football" players={data.footballPlayers} headingTitle={headingTitle} />;
      case "cricket":
        return <TeamPreview key={key} sport="cricket" players={data.cricketPlayers} headingTitle={headingTitle} />;
      case "matches":
        return <MatchesPreview key={key} upcoming={data.upcomingMatches} results={data.recentResults} headingTitle={headingTitle} />;
      case "news":
        return <NewsPreview key={key} news={data.news} headingTitle={headingTitle} />;
      case "finance":
        return <FinancePreview key={key} finance={data.finance} headingTitle={headingTitle} />;
      case "members":
        return <MembersPreview key={key} members={data.members} committee={data.committee} headingTitle={headingTitle} />;
      case "contact":
        return <ContactSection key={key} headingTitle={headingTitle} />;
      default:
        return null;
    }
  };

  return (
    <>
      {sections
        .filter((section) => section.enabled)
        .sort((a, b) => a.order - b.order)
        .map((section) => renderSection(section))}
    </>
  );
}
