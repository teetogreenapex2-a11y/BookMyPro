import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Tee to Green Golf",
  description: "Book golf lessons and club fittings",
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
