// osascript -l JavaScript locked.js — "1" when the login session's screen is locked (pages would be
// occluded → hidden/throttled, and synthetic keystrokes go nowhere).
ObjC.import('CoreGraphics');
function run() {
  const d = ObjC.castRefToObject($.CGSessionCopyCurrentDictionary());
  const v = d.objectForKey('CGSSessionScreenIsLocked');
  return v && v.js ? '1' : '0';
}
