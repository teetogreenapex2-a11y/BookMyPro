// Tracks, per-device, whether anyone has ever successfully signed in
// here before - the best available signal for telling a brand-new,
// first-time app opener apart from a returning customer who's just
// currently signed out (there's no session either way, so that alone
// can't distinguish them). Not perfect - a returning customer on a
// genuinely new device will still look "new" - but it never blocks
// signing in either way, it only decides which option to show first.
const KEY = "bmp_has_signed_in";

export function markHasSignedInOnThisDevice() {
  try {
    localStorage.setItem(KEY, "true");
  } catch {
    // If local storage is unavailable for any reason, the login page
    // just falls back to always showing the Find a Pro-first layout -
    // a mild inconvenience for a returning customer, never a blocker.
  }
}

export function hasSignedInOnThisDeviceBefore(): boolean {
  try {
    return localStorage.getItem(KEY) === "true";
  } catch {
    return false;
  }
}
