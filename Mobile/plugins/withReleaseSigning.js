const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

// Local release APKs are shared by hand, so they need a real key, a versionCode that only goes up,
// and no emulator-only native libs. EAS signs and versions its own builds, so leave those alone.
const MARKER = '// kinbech-release-signing';
const ARCHITECTURES = 'armeabi-v7a,arm64-v8a';

const KEYSTORE_LOADER = `${MARKER}
def releaseKeystoreProps = new Properties()
def releaseKeystorePropsFile = file("\${rootDir}/../credentials/keystore.properties")
if (releaseKeystorePropsFile.exists()) {
    releaseKeystorePropsFile.withInputStream { releaseKeystoreProps.load(it) }
}
def hasReleaseKeystore = releaseKeystoreProps['storeFile'] != null

`;

const RELEASE_SIGNING = `
        if (hasReleaseKeystore) {
            release {
                storeFile file("\${rootDir}/../credentials/\${releaseKeystoreProps['storeFile']}")
                storePassword releaseKeystoreProps['storePassword']
                keyAlias releaseKeystoreProps['keyAlias']
                keyPassword releaseKeystoreProps['keyPassword']
                enableV1Signing true
                enableV2Signing true
                enableV3Signing true
            }
        }`;

// Android refuses to install an APK whose versionCode is lower than the one already on the phone.
const LOCAL_VERSION_CODE = 'versionCode((int) (System.currentTimeMillis() / 60000L - 29000000L))';

const ABI_SPLITS = `
    splits {
        abi {
            enable !gradle.startParameter.taskNames.any { it.toLowerCase().contains('bundle') }
            reset()
            include ${ARCHITECTURES.split(',').map((abi) => `'${abi}'`).join(', ')}
            universalApk true
        }
    }`;

// Prebuilt SDKs (Agora, ML Kit) bring their own x86 libraries even when RN builds ARM only.
// RN marks its core libs as pickFirsts, which beat excludes, so abiFilters is needed too.
const EMULATOR_MARKER = '// kinbech: drop emulator-only native libs';
const DROP_EMULATOR_LIBS = `
${EMULATOR_MARKER}
android {
    packagingOptions {
        jniLibs {
            excludes += ['**/x86/**', '**/x86_64/**']
        }
    }
    defaultConfig {
        ndk {
            abiFilters ${ARCHITECTURES.split(',').map((abi) => `'${abi}'`).join(', ')}
        }
    }
}
`;

function patchBuildGradle(src) {
  if (!src.includes(EMULATOR_MARKER)) src += DROP_EMULATOR_LIBS;
  if (src.includes(MARKER)) return src;
  let out = src.replace(/\nandroid \{\n/, `\n${KEYSTORE_LOADER}android {\n`);
  out = out.replace(/(signingConfigs \{\n\s+debug \{[\s\S]*?\n {8}\})/, `$1${RELEASE_SIGNING}`);
  out = out.replace(
    /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
    '$1signingConfig hasReleaseKeystore ? signingConfigs.release : signingConfigs.debug'
  );
  out = out.replace(/versionCode \d+/, LOCAL_VERSION_CODE);
  out = out.replace(/(\n {4}packagingOptions \{)/, `${ABI_SPLITS}$1`);
  return out;
}

function withReleaseSigning(config) {
  if (process.env.EAS_BUILD) return config;
  config = withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = patchBuildGradle(mod.modResults.contents);
    return mod;
  });
  return withGradleProperties(config, (mod) => {
    const props = mod.modResults.filter((item) => !(item.type === 'property' && item.key === 'reactNativeArchitectures'));
    props.push({ type: 'property', key: 'reactNativeArchitectures', value: ARCHITECTURES });
    mod.modResults = props;
    return mod;
  });
}

module.exports = withReleaseSigning;
