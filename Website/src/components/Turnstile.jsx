import { useEffect, useRef } from 'react';

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        scriptPromise = null;
        reject(new Error('Could not load the human check'));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

/** Cloudflare Turnstile widget; calls onToken(token) when solved and onToken('') when it expires. */
export default function Turnstile({ siteKey, onToken, onError, theme = 'auto' }) {
  const boxRef = useRef(null);
  const onTokenRef = useRef(onToken);
  const onErrorRef = useRef(onError);
  onTokenRef.current = onToken;
  onErrorRef.current = onError;

  useEffect(() => {
    if (!siteKey) return undefined;
    let widgetId = null;
    let cancelled = false;
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !boxRef.current) return;
        widgetId = turnstile.render(boxRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token) => onTokenRef.current?.(token),
          'expired-callback': () => onTokenRef.current?.(''),
          'error-callback': () => onErrorRef.current?.('Human check failed. Please try again.'),
        });
      })
      .catch((error) => onErrorRef.current?.(error.message));
    return () => {
      cancelled = true;
      if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [siteKey, theme]);

  return <div ref={boxRef} className="turnstile-box" />;
}
