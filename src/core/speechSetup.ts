/** SD-137b — WEB build: nothing to register. The voice panel uses the browser's
 *  Web Speech API where it exists (Chrome/Edge), else typed calls. The phone app
 *  uses speechSetup.native.ts. */
export function setupNativeSpeech(): void { /* web: no-op */ }
