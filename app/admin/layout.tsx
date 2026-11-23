import BackBar from "./BackBar";

// Every platform-admin page gets a Back button (these pages have no tab bar).
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BackBar />
      {children}
    </>
  );
}
