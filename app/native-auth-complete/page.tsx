import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

// GET /native-auth-complete
//
// The system-browser side of the native app's Apple sign-in handoff (see
// the full explanation on the NativeAuthHandoff model in schema.prisma).
// This page is the callbackUrl the app points Apple sign-in at - by the
// time a real person's browser lands here, NextAuth has already finished
// its own callback and set a genuine session cookie, but that cookie
// lives in the system browser's own cookie jar, not the native app's
// separate one. This creates a short-lived, single-use handoff pointing
// at that real session, then redirects to the one URL registered as a
// Universal Link - the only moment iOS actually has a reason to hand
// control back to the app at all.
export default async function NativeAuthCompletePage({
  searchParams,
}: {
  searchParams: { finalUrl?: string };
}) {
  const cookieStore = cookies();
  const sessionToken = cookieStore.get("__Secure-next-auth.session-token")?.value
    ?? cookieStore.get("next-auth.session-token")?.value; // non-HTTPS fallback, matches the same fallback already used when this cookie is originally set

  if (!sessionToken) {
    return (
      <main style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>
        <p>Something went wrong finishing sign-in. Please close this and try again from the app.</p>
      </main>
    );
  }

  const handoff = await prisma.nativeAuthHandoff.create({
    data: {
      sessionToken,
      callbackUrl: searchParams.finalUrl || "/",
      // Genuinely only needs to survive a couple of seconds in practice -
      // the whole point is the app picks this up near-instantly via
      // Universal Links - a few minutes is generous headroom, not an
      // invitation to sit unredeemed.
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    },
  });

  redirect(`https://bookmypro.app/native-auth-redeem?token=${handoff.token}`);
}
