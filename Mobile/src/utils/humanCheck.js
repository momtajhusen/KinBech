import { Alert, AppState, Linking } from 'react-native';

const RETURN_TIMEOUT_MS = 10 * 60 * 1000;

/** Resolves once the app comes back to the foreground after the browser was opened. */
function waitForReturn() {
  return new Promise((resolve) => {
    let left = AppState.currentState !== 'active';
    const done = () => {
      clearTimeout(timer);
      sub.remove();
      resolve();
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') left = true;
      else if (left) done();
    });
    const timer = setTimeout(done, RETURN_TIMEOUT_MS);
  });
}

function askToVerify() {
  return new Promise((resolve) => {
    Alert.alert(
      'Quick security check',
      'We noticed many sign-in attempts from this number or network. Confirm you are human in your browser, then come back to KinBech.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Verify', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/**
 * Wraps an OTP request. When the server answers CAPTCHA_REQUIRED, the human check opens in
 * the browser (no WebView needed) and the request is retried with the verified ticket.
 * `send(extra)` must merge `extra` into the request body.
 */
export async function withHumanCheck(send) {
  const first = await send({});
  const info = first.data;
  if (info?.code !== 'CAPTCHA_REQUIRED' || !/^https:\/\//i.test(info?.verifyUrl || '')) return first;

  if (!(await askToVerify())) {
    return { data: info, error: 'A quick security check is needed before we can send the code.' };
  }
  try {
    await Linking.openURL(info.verifyUrl);
  } catch {
    return { data: info, error: 'Could not open the browser for the security check.' };
  }
  await waitForReturn();
  return send({ captchaTicket: info.captchaTicket });
}
