import { NextResponse } from "next/server";

// GET /.well-known/apple-app-site-association
//
// The file iOS itself checks (fetched directly by Apple's own systems,
// not a browser) to decide whether a given URL should open this app
// instead of loading normally. Only /native-auth-redeem is registered -
// deliberately narrow, so a person just browsing to bookmypro.app in
// Safari is never unexpectedly bounced into the app. Team ID and bundle
// ID together form the required "appID" - see capacitor.config.ts for
// the bundle ID (com.bookmypro.app) and the App Store Connect details
// noted elsewhere for the team ID (3N857A5XH6).
export async function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "3N857A5XH6.com.bookmypro.app",
          paths: ["/native-auth-redeem*"],
        },
      ],
    },
  });
}
