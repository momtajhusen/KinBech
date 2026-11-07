const fs = require('fs');
const path = require('path');

// The sell voice helper keeps the mic open while it talks. Android's speech mic (VOICE_RECOGNITION) has no
// echo cancelling, so the phone's own speaker drowns out the seller. The call mic (VOICE_COMMUNICATION) takes
// the speaker out of the recording; echo, noise and gain effects are added where the phone has them.
const file = path.join(
  __dirname,
  '../node_modules/expo-speech-recognition/android/src/main/java/expo/modules/speechrecognition/ExpoAudioRecorder.kt'
);

if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');

const swaps = [
  // The live recording is a raw 16 kHz mono 16-bit file until the mic stops; next to the final WAV, JS can read
  // it while recording (the helper sends what was said over its own voice to the AI).
  ['        tempPcmFile = createTempPcmFile()', '        tempPcmFile = outputFilePath?.let { File("$it.pcm") } ?: createTempPcmFile()'],
  [
    'import android.media.MediaRecorder\n',
    [
      'import android.media.MediaRecorder',
      'import android.media.audiofx.AcousticEchoCanceler',
      'import android.media.audiofx.AudioEffect',
      'import android.media.audiofx.AutomaticGainControl',
      'import android.media.audiofx.NoiseSuppressor',
      '',
    ].join('\n'),
  ],
  [
    '    private var audioRecorder: AudioRecord? = null\n',
    '    private var audioRecorder: AudioRecord? = null\n    private val effects = mutableListOf<AudioEffect>()\n',
  ],
  ['            MediaRecorder.AudioSource.VOICE_RECOGNITION,', '            MediaRecorder.AudioSource.VOICE_COMMUNICATION,'],
  [
    [
      '            if (this.state != AudioRecord.STATE_INITIALIZED) {',
      '                return',
      '            }',
      '',
    ].join('\n'),
    [
      '            if (this.state != AudioRecord.STATE_INITIALIZED) {',
      '                return',
      '            }',
      '            addEffects(audioSessionId)',
      '',
    ].join('\n'),
  ],
  [
    '    override fun stop() {\n        isRecordingAudio = false\n',
    [
      '    private fun addEffects(sessionId: Int) {',
      '        try {',
      '            if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(sessionId)?.let { it.setEnabled(true); effects.add(it) }',
      '            if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(sessionId)?.let { it.setEnabled(true); effects.add(it) }',
      '            if (AutomaticGainControl.isAvailable()) AutomaticGainControl.create(sessionId)?.let { it.setEnabled(true); effects.add(it) }',
      '        } catch (e: Exception) {',
      '            Log.w(TAG, "Audio effects unavailable", e)',
      '        }',
      '    }',
      '',
      '    override fun stop() {',
      '        isRecordingAudio = false',
      '        effects.forEach { runCatching { it.release() } }',
      '        effects.clear()',
      '',
    ].join('\n'),
  ],
];

const original = source;
for (const [from, to] of swaps) {
  if (source.includes(to)) continue;
  if (!source.includes(from)) {
    console.warn(`patch-speech-recognition: "${from.trim().split('\n')[0]}" not found, skipped`);
    continue;
  }
  source = source.replace(from, to);
}
if (source !== original) fs.writeFileSync(file, source);
