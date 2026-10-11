// osascript -l JavaScript launch.js <timeoutMs> <envJSON> <executable> [args...]
// Spawns the executable, then polls the WindowServer every ~2 ms for the first on-screen, normal-layer
// window (> 400x300) owned by that pid. Prints JSON {pid, t0, windowMs} (t0 = wall clock ms).
ObjC.import('Foundation');
ObjC.import('CoreGraphics');
function firstWindow(pid) {
  const arr = ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, 0));
  for (let i = 0; i < arr.count; i++) {
    const w = arr.objectAtIndex(i);
    if (w.objectForKey('kCGWindowOwnerPID').js !== pid || w.objectForKey('kCGWindowLayer').js !== 0) continue;
    const b = w.objectForKey('kCGWindowBounds');
    if (b.objectForKey('Width').js > 400 && b.objectForKey('Height').js > 300) return true;
  }
  return false;
}
function run(argv) {
  const timeout = +argv[0];
  const extra = JSON.parse(argv[1]);
  const task = $.NSTask.alloc.init;
  task.launchPath = argv[2];
  task.arguments = $(argv.slice(3));
  const env = $.NSMutableDictionary.dictionaryWithDictionary($.NSProcessInfo.processInfo.environment);
  for (const k of Object.keys(extra)) env.setObjectForKey($(extra[k]), $(k));
  task.environment = env;
  task.standardOutput = $.NSFileHandle.fileHandleWithNullDevice;
  task.standardError = $.NSFileHandle.fileHandleWithNullDevice;
  const t0 = Date.now();
  task.launch;
  const pid = task.processIdentifier;
  let windowMs = null;
  while (Date.now() - t0 < timeout) {
    if (firstWindow(pid)) {
      windowMs = Date.now() - t0;
      break;
    }
    delay(0.002);
  }
  return JSON.stringify({ pid, t0, windowMs });
}
