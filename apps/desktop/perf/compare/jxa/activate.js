// osascript -l JavaScript activate.js <pid>
ObjC.import('AppKit');
function run(argv) {
  $.NSRunningApplication.runningApplicationWithProcessIdentifier(+argv[0]).activateWithOptions(2);
  return 'ok';
}
