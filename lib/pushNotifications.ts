import webpush from "web-push";
import { prisma } from "./prisma";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("VAPID keys are not set - web push notifications will silently do nothing until they are.");
    return;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notifications@bookmypro.app",
    publicKey,
    privateKey
  );
  configured = true;
}

// Firebase Admin is initialized lazily and only once, same reasoning as
// the web push VAPID setup above - importing firebase-admin at the top of
// every file that touches this module would be wasteful if a given
// request never actually needs to send a native push.
let firebaseApp: import("firebase-admin/app").App | null = null;
let firebaseInitAttempted = false;
async function getFirebaseMessaging() {
  if (!firebaseInitAttempted) {
    firebaseInitAttempted = true;
    const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!key) {
      console.warn("FIREBASE_SERVICE_ACCOUNT_KEY is not set - native push notifications will silently do nothing until it is.");
    } else {
      try {
        const { initializeApp, cert, getApps } = await import("firebase-admin/app");
        const serviceAccount = JSON.parse(key);
        firebaseApp = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
      } catch (err) {
        console.error("Failed to initialize Firebase Admin - check FIREBASE_SERVICE_ACCOUNT_KEY is valid JSON:", err);
      }
    }
  }
  if (!firebaseApp) return null;
  const { getMessaging } = await import("firebase-admin/messaging");
  return getMessaging(firebaseApp);
}

// Sends a push to every device this membership has ever enabled
// notifications on - both web browsers (via VAPID/web push) and the
// native Android/iOS app (via Firebase Cloud Messaging) together, so
// every other part of the app can just call this one function without
// needing to know or care which kind of device someone's actually using.
// A subscription or token that's gone stale gets removed automatically
// rather than left to fail silently on every future push.
export async function sendPushToMembership(membershipId: string, payload: { title: string; body: string; url?: string }) {
  ensureConfigured();

  const [subscriptions, fcmTokens] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { membershipId } }),
    prisma.fcmToken.findMany({ where: { membershipId } }),
  ]);

  const webPushTask = configured && subscriptions.length > 0
    ? Promise.all(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(payload)
            );
          } catch (err: any) {
            // 404/410 means the browser has unsubscribed or the subscription
            // expired on its end - clean it up rather than retry it forever.
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
            } else {
              console.error("Web push notification failed:", err);
            }
          }
        })
      )
    : Promise.resolve();

  const fcmTask = (async () => {
    if (fcmTokens.length === 0) return;
    const messaging = await getFirebaseMessaging();
    if (!messaging) return;

    await Promise.all(
      fcmTokens.map(async (t) => {
        try {
          await messaging.send({
            token: t.token,
            notification: { title: payload.title, body: payload.body },
            data: payload.url ? { url: payload.url } : undefined,
          });
        } catch (err: any) {
          // These specific error codes mean the app was uninstalled or the
          // token otherwise stopped being valid - clean it up rather than
          // retry it forever, same reasoning as the web push 404/410 case.
          if (err?.code === "messaging/registration-token-not-registered" || err?.code === "messaging/invalid-registration-token") {
            await prisma.fcmToken.delete({ where: { id: t.id } }).catch(() => {});
          } else {
            console.error("Native push notification failed:", err);
          }
        }
      })
    );
  })();

  await Promise.all([webPushTask, fcmTask]);
}

// Checks a package after it's just been decremented, and notifies both
// sides once it hits exactly one lesson left - the natural moment for
// the instructor to think about renewal and the player to know they're
// running low. Only fires right at 1, not every time below that, so it's
// a single heads-up rather than a repeated nag on every remaining visit.
export async function checkAndNotifyLowPackage(packageId: string) {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: { business: { select: { slug: true } } },
  });
  if (!pkg || pkg.lessonsRemaining !== 1) return;

  const { businessDestination } = await import("./businessUrl");
  const { getMembership } = await import("./tenant");

  const playerMembership = await getMembership(pkg.userId, pkg.businessId);
  if (playerMembership) {
    await sendPushToMembership(playerMembership.id, {
      title: "One lesson left",
      body: `Your ${pkg.type} package is down to its last lesson.`,
      url: businessDestination(pkg.business.slug, "/book"),
    });
  }

  if (pkg.instructorMembershipId) {
    await sendPushToMembership(pkg.instructorMembershipId, {
      title: "Player's package is running low",
      body: `A player's ${pkg.type} package has one lesson left.`,
      url: businessDestination(pkg.business.slug, "/instructor"),
    });
  }
}
