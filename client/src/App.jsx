import { Loader, Toasty, TooltipProvider } from "@cloudflare/kumo";
import { useEffect, useState } from "react";
import { api } from "./api.js";
import * as cache from "./cache.js";
import { AppShell } from "./components/AppShell.jsx";
import { AuthView } from "./components/AuthView.jsx";
import * as pgp from "./pgp.js";
import { toastManager } from "./toast.js";

const THEMES = ["gold", "midnight", "sakura", "mocha", "latte", "forest", "nord"];

function applyPalette(palette) {
  if (THEMES.includes(palette)) {
    document.documentElement.dataset.theme = palette;
    return;
  }
  delete document.documentElement.dataset.theme;
}

export function App() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [palette, setPalette] = useState(() => localStorage.getItem("em-palette") || "plum");

  useEffect(() => {
    applyPalette(palette);
    localStorage.setItem("em-palette", palette);
  }, [palette]);

  useEffect(() => {
    try {
      navigator.registerProtocolHandler?.("mailto", `${window.location.origin}/?mailto=%s`);
    } catch {}
  }, []);

  useEffect(() => {
    api
      .me()
      .then(async (d) => {
        if (d.user) {
          await cache.initCursor(d.syncCursor);
          setUser(d.user);
          const p = d.user.settings?.palette;
          if (p) setPalette(p === "plum" || THEMES.includes(p) ? p : "plum");
          if (d.user.settings?.imagesDefault !== undefined) {
            localStorage.setItem("em-images-default", d.user.settings.imagesDefault ? "1" : "0");
          }
          if (d.user.pgpEnabled && !pgp.getUnlocked()) {
            const savedPass = await pgp.getRememberedPass();
            if (savedPass) {
              try {
                const key = await api.getPgp();
                if (key.privateKeyEnc) await pgp.unlock(key.privateKeyEnc, savedPass);
              } catch {
                await pgp.forgetPass();
              }
            }
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <TooltipProvider>
      <Toasty toastManager={toastManager}>
        {loading ? (
          <div className="em-center">
            <Loader />
          </div>
        ) : user ? (
          <AppShell
            key={user.id}
            initialUser={user}
            palette={palette}
            onSetPalette={setPalette}
          />
        ) : (
          <AuthView />
        )}
      </Toasty>
    </TooltipProvider>
  );
}
