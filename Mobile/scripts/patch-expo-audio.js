const fs = require('fs');
const path = require('path');

// ExoPlayer waits for 2.5 s of audio before it starts. The voice chat streams its reply about as fast
// as it is spoken, so that wait is heard as a pause. Players made with `preferredForwardBufferDuration`
// (only the voice chat) start after half a second of audio instead.
const file = path.join(
  __dirname,
  '../node_modules/expo-audio/android/src/main/java/expo/modules/audio/AudioPlayer.kt'
);

if (!fs.existsSync(file)) process.exit(0);

const source = fs.readFileSync(file, 'utf8');
const patched = source.replace(
  [
    '              DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_MS,',
    '              DefaultLoadControl.DEFAULT_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS',
  ].join('\n'),
  ['              500,', '              1000'].join('\n')
);
if (patched !== source) fs.writeFileSync(file, patched);
