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

// Some OEM builds (seen on Vivo) make TelecomManager.getPhoneAccount require READ_PHONE_NUMBERS,
// which crashes the app when a call rings. KinBech only registers a self-managed account.
const serviceFile = path.join(path.dirname(file), 'VoiceConnectionService.java');
if (fs.existsSync(serviceFile)) {
  let service = fs.readFileSync(serviceFile, 'utf8');
  const original = service;
  service = service.replace(
    'PhoneAccount phoneAccount = telecomManager.getPhoneAccount(request.getAccountHandle());',
    [
      'PhoneAccount phoneAccount = null;',
      '            try {',
      '                phoneAccount = telecomManager.getPhoneAccount(request.getAccountHandle());',
      '            } catch (SecurityException error) {',
      '                Log.w(TAG, "[VoiceConnectionService] getPhoneAccount denied, treating the account as self-managed");',
      '            }',
    ].join('\n')
  );
  service = service.replace(
    'if((phoneAccount.getCapabilities() & PhoneAccount.CAPABILITY_SELF_MANAGED) == PhoneAccount.CAPABILITY_SELF_MANAGED) {',
    'if(phoneAccount == null || (phoneAccount.getCapabilities() & PhoneAccount.CAPABILITY_SELF_MANAGED) == PhoneAccount.CAPABILITY_SELF_MANAGED) {'
  );
  if (service !== original) fs.writeFileSync(serviceFile, service);
}
