"use client";

import { useSession } from "next-auth/react";

// Wraps a "Find a Pro" business card so selecting it sends a signed-out
// visitor to /login first (with a callbackUrl back to their booking
// page) instead of straight to the booking page itself. Mirrors the
// same check FindProSearch already does for its own search results -
// this just brings the plain "browse nearby" list on the city landing
// page (app/find-a-pro/[city]/page.tsx) in line with it, since that one
// is a server component and can't check session status on its own.
export default function ProListingLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  const { status } = useSession();

  return (
    <a
      href={`/${slug}/book`}
      onClick={(e) => {
        if (status !== "authenticated") {
          e.preventDefault();
          window.location.href = `/login?callbackUrl=${encodeURIComponent(`/${slug}/book`)}`;
        }
      }}
      style={{ display: "block", background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12, padding: 16, textDecoration: "none", color: "inherit" }}
    >
      {children}
    </a>
  );
}
