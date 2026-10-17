import { useAuth } from '../context/AuthContext';
import IndividualPostListingScreen from './IndividualPostListingScreen';
import SellerTypeSelectionScreen from './SellerTypeSelectionScreen';
import ShopPostListingScreen from './ShopPostListingScreen';

export default function PostListingScreen({ navigation, route }) {
  const { user } = useAuth();
  const preference = user?.sellerTypePreference || 'individual';

  if (preference === 'shop') {
    return <ShopPostListingScreen navigation={navigation} />;
  }
  if (preference === 'both') {
    return <SellerTypeSelectionScreen navigation={navigation} route={route || { params: {} }} />;
  }
  return <IndividualPostListingScreen navigation={navigation} />;
}
