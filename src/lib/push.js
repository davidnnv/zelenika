// Web Push for the admin: this device receives a notification for every new reservation,
// even when the app is closed. Needs the Edge Function in Supabase (supabase/functions/push-new-reservation).
import { api } from './api';
import { isIOS, isStandalone } from './pwa';

// The public VAPID key comes from the database (the Edge Function creates it); an env value can override it.
let vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';
export async function loadVapid() {
  if (!vapid) vapid = (await api.getVapidKey().catch(() => '')) || '';
  return vapid;
}

export function pushSupport() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  return 'ok';
}

function keyBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function deviceName() {
  const ua = navigator.userAgent;
  if (/iphone|ipad/i.test(ua)) return 'iPhone/iPad';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows';
  if (/mac/i.test(ua)) return 'Mac';
  return 'Уред';
}

export async function currentSubscription() {
  if (pushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission, subscribe this device and store it. Returns 'on' | 'denied'. */
export async function enablePush() {
  const key = await loadVapid();
  if (!key) throw new Error('PUSH_NOT_CONFIGURED');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return 'denied';
  const reg = (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await api.savePush(sub, deviceName());
  return 'on';
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.removePush(sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}
