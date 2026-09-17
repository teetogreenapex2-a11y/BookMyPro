import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/email";

// GET /api/unsubscribe?u={userId}&t={token}
//
// Deliberately no login required - the whole point of a CAN-SPAM
// unsubscribe link is that it works with one click, straight from an
// email client, for someone who may have never signed in to BookMyPro at
// all. The signed token (see lib/email.ts) is what stands in for auth
// here: it proves the click came from a link this app actually sent to
// this exact user id, without needing a session.
export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("u") || "";
  const token = req.nextUrl.searchParams.get("t") || "";

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return new NextResponse(page("That unsubscribe link isn't valid."), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  await prisma.user.update({ where: { id: userId }, data: { marketingOptOut: true } }).catch(() => null);

  return new NextResponse(
    page("You're unsubscribed. You won't receive marketing emails like this one again - booking confirmations and account emails are unaffected."),
    { headers: { "Content-Type": "text/html" } }
  );
}

function page(message: string) {
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /><title>Unsubscribe</title></head>
<body style="font-family: sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; color: #1B3A2F;">
  <h2>BookMyPro</h2>
  <p>${message}</p>
</body></html>`;
}
