const fs = require('fs');
const path = require('path');

const file = path.join(
  __dirname,
  '../node_modules/react-native-callkeep/android/src/main/java/io/wazo/callkeep/RNCallKeepModule.java'
);

if (!fs.existsSync(file)) process.exit(0);

let source = fs.readFileSync(file, 'utf8');
const before = source;
source = source.replace(
  /@ReactMethod\s+public void displayIncomingCall\(String uuid, String number, String callerName\) \{/,
  'public void displayIncomingCall(String uuid, String number, String callerName) {'
);
source = source.replace(
  /@ReactMethod\s+public void startCall\(String uuid, String number, String callerName\) \{/,
  'public void startCall(String uuid, String number, String callerName) {'
);
if (source !== before) fs.writeFileSync(file, source);
