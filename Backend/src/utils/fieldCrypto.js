const crypto = require('crypto');

/**
 * AES-256-GCM for sensitive fields at rest (shop PAN/VAT).
 * Stored as `enc:v1:<iv>:<tag>:<ciphertext>` (base64url). Values without the prefix are
 * legacy plaintext and are returned unchanged until the startup migration seals them.
 * Key: FIELD_ENCRYPTION_KEY (64 hex chars, or any string which is hashed); falls back to a
 * JWT_SECRET derivative. Changing the key makes existing values unreadable — rotate with a
 * v2 prefix, never by swapping the key in place.
 */

const PREFIX = 'enc:v1:';

function fieldKey() {
  const raw = String(process.env.FIELD_ENCRYPTION_KEY || '');
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
  const material = raw || `${process.env.JWT_SECRET || ''}:kinbech-fields`;
  return crypto.createHash('sha256').update(material).digest();
}

function isSealed(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function sealField(value) {
  const plain = String(value ?? '');
  if (!plain || isSealed(plain)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', fieldKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}:${tag.toString('base64url')}:${encrypted.toString('base64url')}`;
}

function openField(value) {
  if (!isSealed(value)) return String(value ?? '');
  try {
    const [iv, tag, data] = value.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', fieldKey(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** `•••••6789` style hint for lists; full value only via the audited reveal endpoint. */
function maskValue(value) {
  const plain = openField(value);
  if (!plain) return '';
  const tail = plain.slice(-3);
  return `${'•'.repeat(Math.max(3, plain.length - 3))}${tail}`;
}

module.exports = { sealField, openField, maskValue, isSealed };
