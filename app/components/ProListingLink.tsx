// Wraps a "Find a Pro" business card. This used to send a signed-out
// visitor straight to /login before ever reaching the booking page -
// that's exactly the pattern Apple's App Review rejected the app over
// (guideline 5.1.1(v)): browsing available coaches and their open times
// isn't account-based, so it can't require registration first. The
// booking page itself (app/[slug]/book) now handles this correctly -
// anyone can view it, and it only sends someone to /login at the moment
// they actually try to confirm a real booking - so this component just
// needs to be a plain link again and let them through.
export default function ProListingLink({ slug, children }: { slug: string; children: React.ReactNode }) {
  return (
    <a
      href={`/${slug}/book`}
      style={{ display: "block", background: "#FFF", border: "1px solid #E3D9C9", borderRadius: 12, padding: 16, textDecoration: "none", color: "inherit" }}
    >
      {children}
    </a>
  );
}
