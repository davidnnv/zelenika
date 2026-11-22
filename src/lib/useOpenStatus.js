// Live "open now / closed" status in Skopje time, refreshed every minute.
import { useEffect, useState } from 'react';
import { api } from './api';
import { DEFAULT_HOURS } from './config';
import { fmtTime, nowLocal } from './time';

export function useHours() {
  const [hours, setHours] = useState(DEFAULT_HOURS);
  useEffect(() => {
    let on = true;
    api.getHours().then((h) => on && h?.length && setHours(h)).catch(() => {});
    return () => { on = false; };
  }, []);
  return hours;
}

export function statusFor(hours, t) {
  const { day, min } = nowLocal();
  const d = new Date(`${day}T12:00:00`).getDay();
  const h = hours.find((x) => x.weekday === d);
  const fmt = (m) => (m >= 1440 ? t.midnight : fmtTime(m));
  if (h?.is_open && min >= h.open_min && min < h.close_min) return { open: true, title: t.open, sub: `${t.until} ${fmt(h.close_min)}` };
  if (h?.is_open && min < h.open_min) return { open: false, title: t.closed, sub: `${t.opensToday} ${fmt(h.open_min)}` };
  for (let i = 1; i <= 7; i++) {
    const n = hours.find((x) => x.weekday === (d + i) % 7);
    if (n?.is_open) return { open: false, title: t.closed, sub: i === 1 ? `${t.opensTomorrow} ${fmt(n.open_min)}` : `${fmt(n.open_min)}` };
  }
  return { open: false, title: t.closed, sub: '' };
}

export function useOpenStatus(t) {
  const hours = useHours();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 60000);
    return () => clearInterval(id);
  }, []);
  return { hours, status: statusFor(hours, t), today: new Date(`${nowLocal().day}T12:00:00`).getDay() };
}
