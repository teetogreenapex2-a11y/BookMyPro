"use client";

import { useEffect, useState } from "react";

// A sandbox invite link (see the instructor sandbox invite email) can end
// in `?preview=app` to say "show this person a taste of the native app
// experience, not the plain desktop-style web header." There's no account
// flag for this in the database - a sandbox account is just an ordinary
// instructor membership - so the signal lives entirely in the URL and, once
// seen, in localStorage, so it survives every subsequent page a sandbox
// visitor clicks to (the query param itself doesn't follow them site-wide).
//
// This is purely cosmetic: it swaps the desktop header links for a bottom
// tab bar that looks like the real native app's, so someone previewing in
// a browser gets a closer feel for what they'll get once they install it.
// It has no effect on permissions or data - a real customer's browser
// session is untouched unless this exact query param is used.
const STORAGE_KEY = "bmp_sandbox_preview";

export function useSandboxPreview(): boolean {
  const [isSandboxPreview, setIsSandboxPreview] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("preview") === "app") {
      window.localStorage.setItem(STORAGE_KEY, "1");
      // Strip the param so it doesn't clutter every link a sandbox visitor
      // copies or shares, while the localStorage flag keeps doing its job.
      params.delete("preview");
      const rest = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
      setIsSandboxPreview(true);
      return;
    }
    setIsSandboxPreview(window.localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  return isSandboxPreview;
}
