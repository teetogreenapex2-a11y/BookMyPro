// Remote lessons use Daily.co for the video call itself — its REST API is
// about as simple as this gets: create a room, get back a URL, done. No
// embedded call UI to build; both the player and instructor just open the
// URL in their browser and Daily's own hosted page handles the call.
// Docs: https://docs.daily.co/reference/rest-api/rooms/create-room

const DAILY_API_BASE = "https://api.daily.co/v1";

// A room that expires a few hours after the lesson time, rather than
// staying open forever — keeps the business's Daily.co room count (and
// therefore their plan limits) from growing unbounded over time.
const ROOM_LIFETIME_HOURS = 4;

export async function createVideoCallRoom(apiKey: string, startTime: Date): Promise<string | null> {
  try {
    const expiresAt = Math.floor(startTime.getTime() / 1000) + ROOM_LIFETIME_HOURS * 60 * 60;
    const res = await fetch(`${DAILY_API_BASE}/rooms`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        privacy: "public", // anyone with the link can join — the link itself is the access control
        properties: {
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
