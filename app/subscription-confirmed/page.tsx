function SubscriptionConfirmedContent({ status }: { status: string }) {
  const success = status === "success";
  return (
    <div style={{ minHeight: "100vh", background: "var(--fairway, #1B3A2F)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#F6F4EE", borderRadius: 16, padding: "36px 32px", maxWidth: 420, width: "100%", textAlign: "center" }}>
        <img src="/logo.jpg" alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", marginBottom: 16 }} />
        <h1 style={{ fontSize: 22, margin: "0 0 10px", color: "#1B3A2F" }}>
          {success ? "You're all set" : "Checkout cancelled"}
        </h1>
        <p style={{ fontSize: 14, color: "#5C6459", margin: 0 }}>
          {success
            ? "Your BookMyPro subscription is active. You can close this page now."
            : "No charge was made. Reach out if you'd like a new link, or just try again."}
        </p>
      </div>
    </div>
  );
}

export default function SubscriptionConfirmedPage({ searchParams }: { searchParams: { status?: string } }) {
  return <SubscriptionConfirmedContent status={searchParams.status || "success"} />;
}
