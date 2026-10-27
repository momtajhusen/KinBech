import { useAuth } from '../context/AuthContext';
import IndividualPostListingScreen from './IndividualPostListingScreen';
import ShopPostListingScreen from './ShopPostListingScreen';

export default function PostListingScreen({ navigation }) {
  const { user } = useAuth();

  if (user?.sellerTypePreference === 'shop') {
    return <ShopPostListingScreen navigation={navigation} />;
  }
  return <IndividualPostListingScreen navigation={navigation} />;
}
