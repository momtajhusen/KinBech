#!/usr/bin/env node
/**
 * Print SHA-256 SPKI pins for every certificate in a host's TLS chain.
 * Usage: node scripts/cert-pins.js kinbechapi.codersalpha.com
 * Pin an intermediate/root CA (not the leaf, which rotates every ~90 days) plus a backup CA.
 */
const tls = require('tls');
const crypto = require('crypto');

const host = process.argv[2];
if (!host) {
  console.error('Usage: node scripts/cert-pins.js <host>');
  process.exit(1);
}

const socket = tls.connect({ host, port: 443, servername: host }, () => {
  let cert = socket.getPeerCertificate(true);
  const seen = new Set();
  let depth = 0;
  while (cert && cert.raw && !seen.has(cert.fingerprint256)) {
    seen.add(cert.fingerprint256);
    const x509 = new crypto.X509Certificate(cert.raw);
    const spki = x509.publicKey.export({ type: 'spki', format: 'der' });
    const pin = crypto.createHash('sha256').update(spki).digest('base64');
    const role = depth === 0 ? 'leaf (do not pin)' : 'CA';
    console.log(`[${depth}] ${role}\n    subject: ${x509.subject.replace(/\n/g, ', ')}\n    expires: ${x509.validTo}\n    pin:     ${pin}`);
    cert = cert.issuerCertificate;
    depth += 1;
  }
  socket.end();
});

socket.on('error', (error) => {
  console.error(`Could not connect to ${host}: ${error.message}`);
  process.exit(1);
});
