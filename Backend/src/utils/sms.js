/**
 * OTP SMS through a Nepali gateway. SMS_PROVIDER = sparrow | aakash.
 * - sparrow: SPARROW_SMS_TOKEN, SPARROW_SMS_FROM (sender identity approved by Sparrow)
 * - aakash:  AAKASH_SMS_TOKEN
 * Returns true when the gateway accepted the message.
 */

const TIMEOUT_MS = 8000;

function localNumber(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function smsConfigured() {
  const provider = String(process.env.SMS_PROVIDER || '').toLowerCase();
  if (provider === 'sparrow') return Boolean(process.env.SPARROW_SMS_TOKEN && process.env.SPARROW_SMS_FROM);
  if (provider === 'aakash') return Boolean(process.env.AAKASH_SMS_TOKEN);
  return false;
}

async function postForm(url, fields) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, body };
}

async function sendSms(phone, text) {
  const provider = String(process.env.SMS_PROVIDER || '').toLowerCase();
  const to = localNumber(phone);
  if (!smsConfigured() || to.length !== 10) return false;
  try {
    if (provider === 'sparrow') {
      const { ok, body } = await postForm('https://api.sparrowsms.com/v2/sms/', {
        token: process.env.SPARROW_SMS_TOKEN,
        from: process.env.SPARROW_SMS_FROM,
        to,
        text,
      });
      return ok && Number(body.response_code || 200) === 200;
    }
    if (provider === 'aakash') {
      const { ok, body } = await postForm('https://sms.aakashsms.com/sms/v3/send', {
        auth_token: process.env.AAKASH_SMS_TOKEN,
        to,
        text,
      });
      return ok && body.error !== true;
    }
  } catch (error) {
    console.error(`[sms] ${provider} failed:`, error.message);
  }
  return false;
}

function sendOtpSms(phone, code) {
  const minutes = Number(process.env.OTP_EXPIRES_MINUTES || 5);
  return sendSms(phone, `${code} is your KinBech verification code. It expires in ${minutes} minutes. Never share it with anyone.`);
}

module.exports = { smsConfigured, sendSms, sendOtpSms };
