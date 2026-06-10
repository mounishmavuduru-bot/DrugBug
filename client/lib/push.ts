"use client";

// Web Push registration (PRD §14). Registers the service worker, subscribes via
// VAPID, and persists the subscription to SpacetimeDB so the scheduler can
// dispatch dose/refill/recall/caregiver notifications. On Capacitor native
// builds, swap this for @capacitor/push-notifications (the stored row's
// `platform` distinguishes web | ios | android).

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return navigator.serviceWorker.register("/sw.js");
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export interface WebPushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/**
 * Ask for permission and create a push subscription. Returns the subscription
 * (endpoint + keys) to hand to `register_push_subscription`, or null if the user
 * declined or VAPID is not configured.
 */
export async function subscribeWebPush(): Promise<WebPushSub | null> {
  if (!pushSupported() || !VAPID_PUBLIC) return null;
  const reg = await registerServiceWorker();
  if (!reg) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      // Cast: lib.dom types `applicationServerKey` as BufferSource over a strict
      // ArrayBuffer, but our Uint8Array is backed by ArrayBufferLike.
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as unknown as BufferSource,
    }));

  const json = sub.toJSON();
  if (!json.endpoint || !json.keys) return null;
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh!, auth: json.keys.auth! },
  };
}

export async function unsubscribeWebPush(): Promise<void> {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  await sub?.unsubscribe();
}
