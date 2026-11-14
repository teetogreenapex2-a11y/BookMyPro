// Browser-only helpers for "Pay with card or Venmo". Plain DOM so any screen
// can use it with two lines and no extra component wiring.
export type VenmoInfo = { id: string; handle: string; amountCents: number; description: string; ref: string; payeeName: string; link: string };

const GREEN = "#1B3A2F";

function overlay(): { root: HTMLDivElement; box: HTMLDivElement; close: () => void } {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:sans-serif;";
  const box = document.createElement("div");
  box.style.cssText = "background:#fff;border-radius:14px;max-width:400px;width:100%;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.3);";
  root.appendChild(box);
  document.body.appendChild(root);
  return { root, box, close: () => root.remove() };
}

function btn(label: string, primary: boolean) {
  const b = document.createElement("button");
  b.textContent = label;
  b.style.cssText = `display:block;width:100%;box-sizing:border-box;padding:13px 16px;margin-top:10px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;text-align:center;text-decoration:none;${primary ? `background:${GREEN};color:#fff;border:none;` : `background:#fff;color:${GREEN};border:1.5px solid ${GREEN};`}`;
  return b;
}

// Resolves "card", "venmo", or null (dismissed). Skips the question entirely when Venmo isn't set up.
export async function choosePayMethod(slug: string, instructorMembershipId?: string | null): Promise<"card" | "venmo" | null> {
  let available = false;
  try {
    const q = instructorMembershipId ? `?instructor=${encodeURIComponent(instructorMembershipId)}` : "";
    const r = await fetch(`/api/${slug}/venmo/status${q}`);
    available = !!(await r.json()).available;
  } catch { /* fall through to card */ }
  if (!available) return "card";
  return new Promise((resolve) => {
    const { root, box, close } = overlay();
    const h = document.createElement("div");
    h.textContent = "How would you like to pay?";
    h.style.cssText = "font-size:18px;font-weight:700;";
    const card = btn("Pay by card", true);
    const venmo = btn("Pay with Venmo", false);
    const cancel = document.createElement("button");
    cancel.textContent = "Cancel";
    cancel.style.cssText = "display:block;margin:12px auto 0;background:none;border:none;color:#666;font-size:14px;cursor:pointer;";
    box.append(h, card, venmo, cancel);
    const done = (v: "card" | "venmo" | null) => { close(); resolve(v); };
    card.onclick = () => done("card");
    venmo.onclick = () => done("venmo");
    cancel.onclick = () => done(null);
    root.onclick = (e) => { if (e.target === root) done(null); };
  });
}

// Shows the customer where to send the money after the server recorded their Venmo purchase.
export function showVenmoInstructions(v: VenmoInfo, onDone?: () => void) {
  const { box, close } = overlay();
  const money = `$${(v.amountCents / 100).toFixed(2)}`;
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  box.innerHTML = `
    <div style="font-size:18px;font-weight:700;">Pay ${esc(money)} with Venmo</div>
    <div style="font-size:14px;color:#555;margin-top:8px;line-height:1.5;">Send <b>${esc(money)}</b> to <b>@${esc(v.handle.replace(/^@/, ""))}</b> (${esc(v.payeeName)}) for <b>${esc(v.description)}</b>.<br/>Put <b>#${esc(v.ref)}</b> in the note so it's easy to match.</div>
    <div style="font-size:13px;color:#555;margin-top:10px;line-height:1.5;background:#F6F4EE;border-radius:8px;padding:10px;">Your purchase is saved. It's confirmed as soon as ${esc(v.payeeName)} sees your Venmo payment, and you'll get an email receipt then.</div>`;
  const open = btn("Open Venmo", true);
  open.onclick = () => { window.open(v.link, "_blank", "noopener"); };
  const done = btn("I've sent it", false);
  done.onclick = () => { close(); onDone?.(); };
  box.append(open, done);
}
