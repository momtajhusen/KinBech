const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
const iosMapsKey = process.env.GOOGLE_MAPS_IOS_API_KEY || '';

module.exports = ({ config }) => {
  const mapsOptions = {};
  if (androidMapsKey) mapsOptions.androidGoogleMapsApiKey = androidMapsKey;
  if (iosMapsKey) mapsOptions.iosGoogleMapsApiKey = iosMapsKey;

  const plugins = (config.plugins || []).map((plugin) => {
    const name = Array.isArray(plugin) ? plugin[0] : plugin;
    if (name !== 'react-native-maps' || !Object.keys(mapsOptions).length) return plugin;
    return ['react-native-maps', mapsOptions];
  });

  return {
    ...config,
    plugins,
    extra: {
      ...(config.extra || {}),
      maps: {
        android: Boolean(androidMapsKey),
        iosGoogle: Boolean(iosMapsKey),
      },
    },
  };
};
