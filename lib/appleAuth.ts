import jwt from "jsonwebtoken";

// Apple doesn't accept a plain, static client secret like Google does -
// it requires a real JWT, signed with the private key generated in the
// developer portal, that's regenerated regularly rather than reused
// indefinitely. Generating a fresh one on every sign-in (rather than
// caching a long-lived one) is simple and avoids ever having a
// long-lived secret sitting around unnecessarily.
export function generateAppleClientSecret() {
  const privateKey = (process.env.APPLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!privateKey || !process.env.APPLE_TEAM_ID || !process.env.APPLE_KEY_ID || !process.env.APPLE_CLIENT_ID) {
    throw new Error("Apple sign-in isn't fully configured - missing one of APPLE_PRIVATE_KEY, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID");
  }

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
