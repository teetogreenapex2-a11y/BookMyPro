// Remote lessons use Daily.co for the video call itself — its REST API is
// about as simple as this gets: create a room, get back a URL, done. No
// embedded call UI to build; both the player and instructor just open the
// URL in their browser and Daily's own hosted page handles the call.
// Docs: https://docs.daily.co/reference/rest-api/rooms/create-room

const DAILY_API_BASE = "https://api.daily.co/v1";

// A room that only exists in a window tight around the actual lesson
// time, rather than staying open for hours before or after it - the
// link is the only access control (see privacy: "public" below), so
// this window is what actually stops it from being usable as a general
// video-chat room outside of a real, paid lesson. 15 minutes early is
// enough to let people join and settle in without friction; 2 hours
// after start comfortably covers any real lesson length without
// leaving the room open for the rest of the afternoon.
const JOIN_EARLY_MINUTES = 15;
const ROOM_LIFETIME_HOURS = 2;

export async function createVideoCallRoom(apiKey: string, startTime: Date): Promise<string | null> {
  try {
    const startSeconds = Math.floor(startTime.getTime() / 1000);
    const notBefore = startSeconds - JOIN_EARLY_MINUTES * 60;
    const expiresAt = startSeconds + ROOM_LIFETIME_HOURS * 60 * 60;
    const res = await fetch(`${DAILY_API_BASE}/rooms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        privacy: "public", // anyone with the link can join — the link itself is the access control
        properties: {
          nbf: notBefore,
          exp: expiresAt,
          enable_chat: true,
        },
      }),
    });
    if (!res.ok) {
      console.error("Daily.co room creation failed:", await res.text());
      return null;
    }
    const data = await res.json();
    return data.url || null;
  } catch (err) {
    console.error("Daily.co room creation failed:", err);
    return null;
  }
}
