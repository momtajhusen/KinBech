import ApartmentRounded from '@mui/icons-material/ApartmentRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import ChairRounded from '@mui/icons-material/ChairRounded';
import ChatRounded from '@mui/icons-material/ChatRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CheckroomRounded from '@mui/icons-material/CheckroomRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';
import HelpRounded from '@mui/icons-material/HelpRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import LaptopMacRounded from '@mui/icons-material/LaptopMacRounded';
import LocationOnRounded from '@mui/icons-material/LocationOnRounded';
import LockRounded from '@mui/icons-material/LockRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PhoneIphoneRounded from '@mui/icons-material/PhoneIphoneRounded';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import ReportProblemRounded from '@mui/icons-material/ReportProblemRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import StoreRounded from '@mui/icons-material/StoreRounded';
import TwoWheelerRounded from '@mui/icons-material/TwoWheelerRounded';
import VerifiedUserRounded from '@mui/icons-material/VerifiedUserRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';

/** Wraps a Material icon so callers keep passing `width`/`height` like the old inline SVGs. */
function material(Icon) {
  function KbIcon({ width = 24, height = width, style, ...props }) {
    return <Icon aria-hidden style={{ fontSize: Math.max(width, height), ...style }} {...props} />;
  }
  return KbIcon;
}

export const IconLocation = material(LocationOnRounded);
export const IconChat = material(ChatRounded);
export const IconStore = material(StorefrontRounded);
export const IconHeart = material(FavoriteRounded);
export const IconStar = material(StarRounded);
export const IconShield = material(VerifiedUserRounded);
export const IconPhone = material(PhonelinkLockRounded);
export const IconSearch = material(SearchRounded);
export const IconHandshake = material(HandshakeRounded);
export const IconUser = material(PersonRounded);
export const IconShop = material(StoreRounded);
export const IconEye = material(VisibilityRounded);
export const IconLock = material(LockRounded);
export const IconAlert = material(ReportProblemRounded);
export const IconBuilding = material(ApartmentRounded);
export const IconMobile = material(PhoneIphoneRounded);
export const IconLaptop = material(LaptopMacRounded);
export const IconElectronics = material(DevicesRounded);
export const IconFurniture = material(ChairRounded);
export const IconVehicle = material(TwoWheelerRounded);
export const IconFashion = material(CheckroomRounded);
export const IconCheck = material(CheckRounded);
export const IconHome = material(HomeRounded);
export const IconGrid = material(CategoryRounded);
export const IconHelp = material(HelpRounded);
export const IconChevronDown = material(ExpandMoreRounded);
export const IconChevronRight = material(ChevronRightRounded);
