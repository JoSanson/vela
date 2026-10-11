// osascript -l JavaScript click.js <x> <y>  — one left click at global screen coords (points).
ObjC.import('CoreGraphics');
function run(argv) {
  const p = $.CGPointMake(+argv[0], +argv[1]);
  for (const t of [$.kCGEventLeftMouseDown, $.kCGEventLeftMouseUp]) {
    $.CGEventPost($.kCGHIDEventTap, $.CGEventCreateMouseEvent(null, t, p, $.kCGMouseButtonLeft));
    delay(0.03);
  }
  return 'ok';
}
