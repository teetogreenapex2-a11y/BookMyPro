import webpush from "web-push";
import { prisma } from "./prisma";

let configured = false;
function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    console.warn("VAPID keys are not set - push notifications will silently do nothing until they are.");
    return;
  }
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:notifications@bookmypro.app",
    publicKey,
    privateKey
  );
  configured = true;
}

// Sends a push to every device/browser this membership has ever enabled
// notifications on - typically just one, but nothing stops someone from
// granting permission on both their phone and their laptop. A subscription
// that's gone stale (browser says it's no longer valid) gets removed
// automatically rather than left to fail silently on every future push.
export async function sendPushToMembership(membershipId: string, payload: { title: string; body: string; url?: string }) {
  ensureConfigured();
  if (!configured) return;

  const subscriptions = await prisma.pushSubscription.findMany({ where: { membershipId } });
  if (subscriptions.length === 0) return;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        // 404/410 means the browser has unsubscribed or the subscription
        // expired on its end - clean it up rather than retry it forever.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("Push notification failed:", err);
        }
      }
    })
  );
}
