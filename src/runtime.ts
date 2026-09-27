/** True when running inside the Tauri desktop shell (vs. the browser preview). */
export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
