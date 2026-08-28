import { redirect } from "next/navigation";

// GET /native-auth-redeem?token=...
//
// This exact path is what's registered in the apple-app-site-association
// file as a Universal Link - when it does its job, iOS intercepts this
// navigation before it ever actually loads here and hands the URL
// straight to the app instead (see app/layout's native-auth listener,
// which is what actually redeems the token). This page's own content is
// only ever seen as a fallback - if the app isn't installed, or Universal
// Links doesn't fire for some other reason. Either way, the person's
// browser session (set on /native-auth-complete just before this) is
// still perfectly real and valid, so there's nothing broken about
// sending them on to the normal site rather than leaving them stranded.
export default function NativeAuthRedeemPage() {
  redirect("https://bookmypro.app/");
}
