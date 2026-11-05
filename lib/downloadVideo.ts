import { Capacitor } from "@capacitor/core";

// Saves a video to the phone.
// - In the Android/iOS app, the in-app web view can't save a blob download,
//   so the file opens in the phone's own browser with Vercel Blob's
//   ?download=1, which makes the browser download it into Downloads.
// - On the website, fetching it as a blob first forces a real download for
//   a cross-origin file (a plain <a download> just navigates to it).
export async function downloadVideo(url: string, filename: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    const sep = url.includes("?") ? "&" : "?";
    await Browser.open({ url: `${url}${sep}download=1` });
    return;
  }
  const res = await fetch(url);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}
