import jwt from "jsonwebtoken";

// Apple doesn't accept a plain, static client secret like Google does -
// it requires a real JWT, signed with the private key generated in the
// developer portal, that's regenerated regularly rather than reused
// indefinitely. Generating a fresh one on every sign-in (rather than
// caching a long-lived one) is simple and avoids ever having a
// long-lived secret sitting around unnecessarily.
export function generateAppleClientSecret() {
  const raw = (process.env.APPLE_PRIVATE_KEY || "").trim();
  if (!raw || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_CLIENT_ID) {
    throw new Error("Apple sign-in isn't fully configured - missing one of APPLE_PRIVATE_KEY, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID");
  }

  // Base64 is the real, robust way to store a multi-line PEM key in an
  // environment variable - manually retyping it with escaped \n
  // characters is genuinely easy to get wrong (a dropped character, an
  // extra space), which silently produces a key that just won't parse.
  // If it doesn't look like a real PEM key already, treat it as base64
  // and decode it first.
  const privateKey = raw.includes("BEGIN PRIVATE KEY") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");

  return jwt.sign(
    {
      iss: process.env.APPLE_TEAM_ID,
      aud: "https://appleid.apple.com",
      sub: process.env.APPLE_CLIENT_ID,
    },
    privateKey,
    {
      algorithm: "ES256",
      expiresIn: "150d", // Apple allows up to 6 months; naturally refreshes on every new deploy anyway
      keyid: process.env.APPLE_KEY_ID,
    }
  );
}
