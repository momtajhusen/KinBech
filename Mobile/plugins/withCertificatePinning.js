const fs = require('fs');
const path = require('path');
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

/**
 * Android certificate pinning via Network Security Config.
 *
 * No-op unless CERT_PINS is set at prebuild time, so dev builds (cleartext Metro) are untouched.
 * Set it only for release builds, e.g. in the EAS production profile env:
 *   CERT_PINS="<base64 sha256 SPKI>,<backup pin>"   (at least two: current CA + backup CA)
 *   CERT_PIN_EXPIRES="2027-06-30"                    (after this date Android stops enforcing pins)
 *   CERT_PIN_DOMAINS="kinbechapi.codersalpha.com"    (optional, comma separated)
 * Get pins with: node scripts/cert-pins.js kinbechapi.codersalpha.com
 */

const XML_NAME = 'network_security_config';

function readOptions() {
  const pins = String(process.env.CERT_PINS || '')
    .split(',')
    .map((pin) => pin.trim())
    .filter(Boolean);
  if (!pins.length) return null;

  const expires = String(process.env.CERT_PIN_EXPIRES || '').trim();
  if (pins.length < 2) throw new Error('CERT_PINS needs at least two pins (current + backup).');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) {
    throw new Error('CERT_PIN_EXPIRES (YYYY-MM-DD) is required so a bad pin cannot brick old installs forever.');
  }
  for (const pin of pins) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(pin)) throw new Error(`Not a base64 SHA-256 pin: ${pin}`);
  }
  const domains = String(process.env.CERT_PIN_DOMAINS || 'kinbechapi.codersalpha.com')
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);
  return { pins, expires, domains };
}

function buildXml({ pins, expires, domains }) {
  const domainLines = domains.map((d) => `    <domain includeSubdomains="false">${d}</domain>`).join('\n');
  const pinLines = pins.map((p) => `      <pin digest="SHA-256">${p}</pin>`).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
  <domain-config cleartextTrafficPermitted="false">
${domainLines}
    <pin-set expiration="${expires}">
${pinLines}
    </pin-set>
  </domain-config>
</network-security-config>
`;
}

module.exports = function withCertificatePinning(config) {
  const options = readOptions();
  if (!options) return config;

  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const resDir = await AndroidConfig.Paths.getResourceFolderAsync(mod.modRequest.projectRoot);
      const xmlDir = path.join(resDir, 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(path.join(xmlDir, `${XML_NAME}.xml`), buildXml(options));
      return mod;
    },
  ]);

  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.$['android:networkSecurityConfig'] = `@xml/${XML_NAME}`;
    return mod;
  });
};
