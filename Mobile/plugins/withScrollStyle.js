const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidColors, withAndroidStyles, withDangerousMod } = require('expo/config-plugins');

const { assignColorValue } = AndroidConfig.Colors;
const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles;

// App green (#047857) at low alpha so scrolling stays quiet. Android 12+ uses a stretch instead of the glow.
const COLORS = {
  colorPrimary: '#047857',
  scrollThumb: '#59047857',
  scrollEdge: '#33047857',
};

const THEME_ITEMS = {
  'android:scrollbarThumbVertical': '@drawable/scroll_thumb',
  'android:scrollbarThumbHorizontal': '@drawable/scroll_thumb',
  'android:scrollbarTrackVertical': '@android:color/transparent',
  'android:scrollbarTrackHorizontal': '@android:color/transparent',
  'android:scrollbarSize': '3dp',
  'android:scrollbarFadeDuration': '250',
  'android:scrollbarDefaultDelayBeforeFade': '500',
  'android:colorEdgeEffect': '@color/scrollEdge',
};

const THUMB_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <solid android:color="@color/scrollThumb" />
  <corners android:radius="2dp" />
  <size android:width="3dp" android:height="3dp" />
</shape>
`;

function withScrollStyle(config) {
  config = withAndroidColors(config, (mod) => {
    Object.entries(COLORS).forEach(([name, value]) => {
      mod.modResults = assignColorValue(mod.modResults, { name, value });
    });
    return mod;
  });

  config = withAndroidStyles(config, (mod) => {
    Object.entries(THEME_ITEMS).forEach(([name, value]) => {
      mod.modResults = assignStylesValue(mod.modResults, { add: true, parent: getAppThemeGroup(), name, value });
    });
    return mod;
  });

  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'scroll_thumb.xml'), THUMB_XML);
      return mod;
    },
  ]);
}

module.exports = withScrollStyle;
