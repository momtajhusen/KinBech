const { withAndroidManifest, withMainActivity, withProjectBuildGradle } = require('expo/config-plugins');

const NOTIFEE_MAVEN = 'maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';

const PERMISSIONS = [
  'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.WAKE_LOCK',
  'android.permission.DISABLE_KEYGUARD',
  'android.permission.SYSTEM_ALERT_WINDOW',
  'android.permission.VIBRATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
  'android.permission.FOREGROUND_SERVICE_PHONE_CALL',
  'android.permission.FOREGROUND_SERVICE_MICROPHONE',
  'android.permission.MANAGE_OWN_CALLS',
  'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
];

function ensurePermission(manifest, name) {
  const list = manifest.manifest['uses-permission'] || [];
  const exists = list.some((item) => item.$?.['android:name'] === name);
  if (!exists) {
    list.push({ $: { 'android:name': name } });
  }
  manifest.manifest['uses-permission'] = list;
}

function withNotifeeMaven(config) {
  return withProjectBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') return mod;
    if (mod.modResults.contents.includes('@notifee/react-native/android/libs')) return mod;
    mod.modResults.contents = mod.modResults.contents.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      `allprojects {\n  repositories {\n    ${NOTIFEE_MAVEN}`
    );
    return mod;
  });
}

function ensureService(application, service) {
  const services = application.service || [];
  const name = service.$['android:name'];
  if (!services.some((item) => item.$?.['android:name'] === name)) {
    services.push(service);
  }
  application.service = services;
}

function withIncomingCall(config) {
  config = withNotifeeMaven(config);
  config = withAndroidManifest(config, (mod) => {
    PERMISSIONS.forEach((name) => ensurePermission(mod.modResults, name));
    const application = mod.modResults.manifest.application?.[0];
    if (application) {
      ensureService(application, {
        $: {
          'android:name': 'io.wazo.callkeep.VoiceConnectionService',
          'android:label': 'KinBech',
          'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
          'android:exported': 'true',
          'android:foregroundServiceType': 'microphone|phoneCall',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.telecom.ConnectionService' } }],
          },
        ],
      });
      ensureService(application, {
        $: {
          'android:name': 'io.wazo.callkeep.RNCallKeepBackgroundMessagingService',
          'android:exported': 'false',
        },
      });
      ensureService(application, {
        $: {
          'android:name': '.IncomingCallWatchService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
          'android:stopWithTask': 'false',
        },
        property: [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value':
                'Receives KinBech voice calls while the app is in the background, the screen is locked, or the app was closed.',
            },
          },
        ],
      });
      const receivers = application.receiver || [];
      if (!receivers.some((item) => item.$?.['android:name'] === '.IncomingCallActionReceiver')) {
        receivers.push({
          $: {
            'android:name': '.IncomingCallActionReceiver',
            'android:exported': 'false',
          },
        });
      }
      application.receiver = receivers;
    }
    const activities = mod.modResults.manifest.application?.[0]?.activity || [];
    activities.forEach((activity) => {
      if (activity.$?.['android:name'] === '.MainActivity') {
        activity.$['android:showWhenLocked'] = 'true';
        activity.$['android:turnScreenOn'] = 'true';
      }
    });
    return mod;
  });

  config = withMainActivity(config, (mod) => {
    if (mod.modResults.language !== 'kt') return mod;
    if (mod.modResults.contents.includes('setShowWhenLocked')) return mod;
    mod.modResults.contents = mod.modResults.contents.replace(
      'super.onCreate(null)',
      `super.onCreate(null)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }`
    );
    return mod;
  });

  return config;
}

module.exports = withIncomingCall;
