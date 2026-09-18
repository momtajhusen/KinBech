import { Image } from 'react-native';

const APP_LOGO = require('../../assets/icons/app-icon.png');

export default function BrandLogo({ size = 120 }) {
  return (
    <Image
      source={APP_LOGO}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
      }}
      resizeMode="contain"
      accessibilityLabel="KinBech"
    />
  );
}
