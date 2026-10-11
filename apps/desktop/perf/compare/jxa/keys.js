// osascript -l JavaScript keys.js <pid> <gapMs> <keyCodes comma-separated>
// Activates the app, then posts Cmd+Option+<arrow> to it, one key per gap. Prints the wall-clock ms of
// each post (same clock as Date.now() in node and in the pages).
ObjC.import('CoreGraphics');
ObjC.import('AppKit');
function run(argv) {
  const pid = +argv[0];
  const gap = +argv[1] / 1000;
  const codes = argv[2].split(',').map(Number);
  $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid).activateWithOptions(2);
  delay(0.8);
  const flags = $.kCGEventFlagMaskCommand | $.kCGEventFlagMaskAlternate | $.kCGEventFlagMaskSecondaryFn;
  const out = [];
  for (const c of codes) {
    const down = $.CGEventCreateKeyboardEvent(null, c, true);
    const up = $.CGEventCreateKeyboardEvent(null, c, false);
    $.CGEventSetFlags(down, flags);
    $.CGEventSetFlags(up, flags);
    out.push(Date.now());
    $.CGEventPostToPid(pid, down);
    $.CGEventPostToPid(pid, up);
    delay(gap);
  }
  return out.join(' ');
}
