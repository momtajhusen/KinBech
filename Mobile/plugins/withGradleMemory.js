const { withGradleProperties } = require('expo/config-plugins');

// Release lint runs out of the default 512 MB metaspace and fails assembleRelease.
const JVM_ARGS = '-Xmx4096m -XX:MaxMetaspaceSize=1536m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8';

function withGradleMemory(config) {
  return withGradleProperties(config, (mod) => {
    const props = mod.modResults.filter((item) => !(item.type === 'property' && item.key === 'org.gradle.jvmargs'));
    props.push({ type: 'property', key: 'org.gradle.jvmargs', value: JVM_ARGS });
    mod.modResults = props;
    return mod;
  });
}

module.exports = withGradleMemory;
