import { createKumoToastManager } from "@cloudflare/kumo";

export const toastManager = createKumoToastManager();

export function notify(title, description, variant) {
  toastManager.add({ title, description, variant });
}

export function notifyError(err) {
  if (err?.status === 401) return;
  const msg = err?.message || String(err || "Something went wrong");
  toastManager.add({ title: "Error", description: msg, variant: "error" });
}
