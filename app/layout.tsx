import "./globals.css";
import Providers from "./providers";
import type { Viewport } from "next";

export const metadata = {
  title: "Tee to Green Golf",
  description: "Book golf lessons and club fittings",
};

// viewportFit: "cover" is what actually turns on env(safe-area-inset-*)
// inside the native app - without it, those values silently stay 0 even
// on a phone with a notch or status bar, and content draws straight
// under it. Harmless on the regular website too, since there's no
// notch/status bar there for it to react to.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
