const { withAppBuildGradle } = require('expo/config-plugins');

// Calls are voice-only. Agora's optional "*_extension" libraries for video, face, lip-sync,
// spatial audio and screen sharing are never loaded, so drop them from every ABI.
// Kept: AI noise suppression and AI echo cancellation (used by voice calls).
const UNUSED_AGORA_EXTENSIONS = [
  'audio_beauty',
  'clear_vision',
  'content_inspect',
  'face_capture',
  'face_detection',
  'lip_sync',
  'screen_capture',
  'segmentation',
  'spatial_audio',
  'video_av1_encoder',
  'video_encoder',
  'video_quality_analyzer',
];

const MARKER = '// kinbech: drop unused Agora extensions';

function packagingBlock() {
  const lines = UNUSED_AGORA_EXTENSIONS.map((name) => `        '**/libagora_${name}_extension.so',`).join('\n');
  return `
${MARKER}
android {
  packaging {
    jniLibs {
      excludes += [
${lines}
      ]
    }
  }
}
`;
}

function withAgoraSlim(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += packagingBlock();
    }
    return mod;
  });
}

module.exports = withAgoraSlim;
module.exports.packagingBlock = packagingBlock;
