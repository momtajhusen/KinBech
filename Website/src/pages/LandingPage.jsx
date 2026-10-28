import Hero from '../components/Hero';
import StatsStrip from '../components/StatsStrip';
import { HomeDownloadBand, HomeSellerBand, HomeStory } from '../components/HomeStory';
import Footer from '../components/Footer';

export default function LandingPage() {
  return (
    <>
      <Hero />
      <StatsStrip />
      <HomeStory />
      <HomeSellerBand />
      <HomeDownloadBand />
      <Footer />
    </>
  );
}
