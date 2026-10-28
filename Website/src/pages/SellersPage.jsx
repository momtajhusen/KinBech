import { Link } from 'react-router-dom';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import PhotoLibraryRounded from '@mui/icons-material/PhotoLibraryRounded';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import PinDropRounded from '@mui/icons-material/PinDropRounded';
import ReviewsRounded from '@mui/icons-material/ReviewsRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import PageShell from '../components/PageShell';
import ForSellers from '../components/ForSellers';
import IconList, { IconTitle } from '../components/IconList';

const INDIVIDUAL = [
  { icon: PhonelinkLockRounded, text: 'Phone OTP verified account' },
  { icon: PhotoLibraryRounded, text: 'Up to 8 photos per listing' },
  { icon: PinDropRounded, text: 'Set city & district location' },
  { icon: Inventory2Rounded, text: 'Manage from My Listings' },
];

const SHOP = [
  { icon: AccessTimeRounded, text: 'Shop logo & opening hours' },
  { icon: CategoryRounded, text: 'Category & business description' },
  { icon: VerifiedRounded, text: 'Admin verification for badge' },
  { icon: ReviewsRounded, text: 'Reviews & Explore visibility' },
];

export default function SellersPage() {
  return (
    <PageShell
      label="For sellers"
      title="Two ways to sell on KinBech"
      titleNe="KinBech मा बेच्ने दुई सजिलो तरिका"
      neFirst
      subtitle="Start as an individual, grow into a shop — switch anytime from your profile."
      image="sellers-hero"
      highlights={['Individual or shop', 'Switch anytime', 'Buyers near you']}
    >
      <ForSellers embedded />
      <div className="container">
        <section className="page-info-card">
          <IconTitle icon={ChecklistRounded} ne="बिक्रेताको चेकलिस्ट">Seller checklist</IconTitle>
          <div className="page-checklist">
            <div>
              <h4>Individual seller <span lang="ne" className="ne-inline">· व्यक्तिगत बिक्रेता</span></h4>
              <IconList items={INDIVIDUAL} tone="blue" />
            </div>
            <div>
              <h4>Shop owner <span lang="ne" className="ne-inline">· पसल सञ्चालक</span></h4>
              <IconList items={SHOP} tone="violet" />
            </div>
          </div>
          <Link to="/explore" className="btn btn-primary page-cta-btn">See sellers on Explore</Link>
        </section>
      </div>
    </PageShell>
  );
}
