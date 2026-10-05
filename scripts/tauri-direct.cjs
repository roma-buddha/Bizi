// Workaround for this environment: the npm "tauri" shim misdetects the host
// binary and injects a bogus argv. Call the native CLI binding directly.
process.argv[2] = process.argv[2] || "build";
const { run } = require("@tauri-apps/cli");
run(process.argv.slice(2), "tauri", (error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
});
