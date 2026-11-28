const fs=require("fs");
function patch(f,edits){let s=fs.readFileSync(f,"utf8");const crlf=s.includes("\r\n");s=s.replace(/\r\n/g,"\n");
for(const [a,b,mark] of edits){if(s.includes(mark)){console.log("skip",f,mark);continue;}if(!s.includes(a)){console.log("MARKER NOT FOUND in",f,":",a.slice(0,50));process.exit(1);}s=s.replace(a,b);}
if(crlf)s=s.replace(/\n/g,"\r\n");fs.writeFileSync(f,s);console.log("patched",f);}

patch("app/api/[slug]/raffle/admin/route.ts",[
[`    if (board.status !== "open") return NextResponse.json({ error: "Already drawn" }, { status: 400 });
    await prisma.raffleSpace.deleteMany({ where: { boardId: board.id, number: Number(body.number) } });
    return NextResponse.json({ ok: true });
  }
`,`    if (board.status !== "open" && board.status !== "cancelled") return NextResponse.json({ error: "Already drawn" }, { status: 400 });
    await prisma.raffleSpace.deleteMany({ where: { boardId: board.id, number: Number(body.number) } });
    return NextResponse.json({ ok: true });
  }

  // Cancel the raffle: stamps it CANCELLED and stops new claims. Spaces stay until released.
  if (body.action === "cancelraffle") {
    if (board.status === "drawn") return NextResponse.json({ error: "Already drawn" }, { status: 400 });
    await prisma.raffleBoard.update({ where: { id: board.id }, data: { status: "cancelled" } });
    return NextResponse.json({ ok: true });
  }
`,"action === \"cancelraffle\""]]);

patch("app/api/[slug]/raffle/route.ts",[
[`  if (board.status !== "open") return NextResponse.json({ error: "This raffle has already been drawn" }, { status: 400 });`,
`  if (board.status === "cancelled") return NextResponse.json({ error: "This raffle was cancelled" }, { status: 400 });
  if (board.status !== "open") return NextResponse.json({ error: "This raffle has already been drawn" }, { status: 400 });`,"This raffle was cancelled"]]);

patch("app/[slug]/raffle/RaffleClient.tsx",[
[`  const drawn = board?.status === "drawn";`,`  const drawn = board?.status === "drawn";
  const cancelled = board?.status === "cancelled";`,"const cancelled ="],
[`const open = !s && !drawn;`,`const open = !s && !drawn && !cancelled;`,"!drawn && !cancelled"],
[`[drawn ? "Drawn" : "Open", "Status"]`,`[drawn ? "Drawn" : cancelled ? "Cancelled" : "Open", "Status"]`,`cancelled ? "Cancelled"`],
[`            <div style={{ background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>`,
`            <div style={{ position: "relative", overflow: "hidden", background: "#FFF", border: "1px solid var(--border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
              {cancelled && (
                <div aria-label="Cancelled" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 5, background: "rgba(255,255,255,0.45)" }}>
                  <div style={{ transform: "rotate(-30deg)", border: "6px solid #B23A3A", color: "#B23A3A", borderRadius: 12, padding: "6px 22px", fontSize: "clamp(40px, 13vw, 96px)", fontWeight: 900, letterSpacing: "0.08em", background: "rgba(255,255,255,0.8)" }}>CANCELLED</div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>`,"position: \"relative\", overflow: \"hidden\""],
[`                {drawn ? "Winners drawn" : pledgedCount`,`                {drawn ? "Winners drawn" : cancelled ? "Raffle cancelled" : pledgedCount`,`cancelled ? "Raffle cancelled"`],
[`              <button
                disabled={adminBusy}
                onClick={() => { if (window.confirm("Reset the whole raffle?`,`              {!drawn && !cancelled && (
                <button
                  disabled={adminBusy}
                  onClick={() => { if (window.confirm("Cancel this raffle? It gets a CANCELLED stamp and nobody can claim spaces. Spaces stay until you release them (and refund anyone who paid).")) admin("cancelraffle"); }}
                  style={{ background: "#B23A3A", color: "#FFF", border: "none", borderRadius: 8, padding: "10px 14px", fontSize: 13, fontWeight: 700 }}
                >
                  Cancel raffle
                </button>
              )}
              <button
                disabled={adminBusy}
                onClick={() => { if (window.confirm("Reset the whole raffle?`,"admin(\"cancelraffle\")"],
]);
