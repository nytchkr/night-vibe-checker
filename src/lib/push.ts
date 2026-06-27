"use client";

const SERVICE_WORKER_URL = "/sw.js";

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export async function subscribeToPush(): Promise<PushSubscription | null> {
  if (typeof window === "undefined") return null;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;

  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublicKey) return null;

  const permission = await requestNotificationPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
  const existingSubscription = await registration.pushManager.getSubscription();
  if (existingSubscription) return existingSubscription;

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });
}

export async function savePushSubscription(accessToken: string): Promise<PushSubscription | null> {
  const subscription = await subscribeToPush();
  if (!subscription) return null;

  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(subscription.toJSON()),
  });

  if (!response.ok) throw new Error("Could not save push subscription.");
  return subscription;
}

export async function unsubscribeFromPush(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await fetch("/api/push/subscribe", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);

  await subscription.unsubscribe();
}

function urlBase64ToUint8Array(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output.buffer as ArrayBuffer;
}
