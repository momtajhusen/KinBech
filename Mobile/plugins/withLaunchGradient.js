const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidStyles, withDangerousMod, withMainActivity } = require('expo/config-plugins');

const { assignStylesValue, getAppThemeGroup } = AndroidConfig.Styles;

// Must match LAUNCH_GRADIENT in src/screens/SplashScreen.js so the window and the JS splash look the same.
const GRADIENT_XML = `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">
  <gradient
    android:type="linear"
    android:angle="270"
    android:startColor="#0B0F17"
    android:centerColor="#1F2937"
    android:endColor="#047857" />
</shape>
`;

const SUPER_ON_CREATE = 'super.onCreate(null)';
const HIDE_LINE = 'SplashScreenManager.hide()';
const MANAGER_IMPORT = 'import expo.modules.splashscreen.SplashScreenManager';

/**
 * The window behind React draws the splash gradient, and the system splash is released on the
 * first native frame instead of waiting for JS, so launch never shows a plain dark screen.
 */
function withLaunchGradient(config) {
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = assignStylesValue(mod.modResults, {
      add: true,
      parent: getAppThemeGroup(),
      name: 'android:windowBackground',
      value: '@drawable/launch_gradient',
    });
    return mod;
  });

  config = withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    if (!src.includes(HIDE_LINE)) {
      if (!src.includes(SUPER_ON_CREATE)) {
        throw new Error('withLaunchGradient: super.onCreate(null) not found in MainActivity');
      }
      src = src.replace(/^(\s*)super\.onCreate\(null\)\n/m, `$1${SUPER_ON_CREATE}\n$1${HIDE_LINE}\n`);
    }
    if (!src.includes(MANAGER_IMPORT)) {
      src = src.replace(/^(package .+\n)/, `$1${MANAGER_IMPORT}\n`);
    }
    mod.modResults.contents = src;
    return mod;
  });

  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(path.join(dir, 'launch_gradient.xml'), GRADIENT_XML);
      return mod;
    },
  ]);
}

module.exports = withLaunchGradient;
