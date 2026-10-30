// Speech recognition events reach every listener in the app; only the current owner should react.
let owner = 0;

export function claimSpeech(id) {
  owner = id;
}

export function ownsSpeech(id) {
  return owner !== 0 && owner === id;
}

export function releaseSpeech(id) {
  if (owner === id) owner = 0;
}
