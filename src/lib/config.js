// Business details shown on the site. Change them here.
export const BUSINESS = {
  name: 'Zelenika Beer Garden',
  phone: '+38978366023',
  phoneLabel: '078 366 023',
  phoneIntl: '+389 78 366 023',
  email: 'shale.bastion@gmail.com',
  address: { mk: 'Средно Водно, 1000 Скопје', en: 'Sredno Vodno, 1000 Skopje' },
  maps: 'https://www.google.com/maps/search/?api=1&query=Zelenika+Beer+Garden+Sredno+Vodno+Skopje',
  tripadvisor: 'https://www.tripadvisor.com/Restaurant_Review-g295110-d23629217-Reviews-Zelenika_Beer_Garden-Skopje_Skopje_Region.html',
};

export const TZ = 'Europe/Skopje';

// Used until the database answers (and in the demo): same as supabase/schema.sql.
export const DEFAULT_HOURS = [
  { weekday: 0, is_open: true, open_min: 600, close_min: 1320 },
  { weekday: 1, is_open: true, open_min: 600, close_min: 1305 },
  { weekday: 2, is_open: true, open_min: 600, close_min: 1305 },
  { weekday: 3, is_open: true, open_min: 600, close_min: 1305 },
  { weekday: 4, is_open: true, open_min: 600, close_min: 1305 },
  { weekday: 5, is_open: true, open_min: 600, close_min: 1440 },
  { weekday: 6, is_open: true, open_min: 600, close_min: 1440 },
];

export const DEFAULT_SETTINGS = {
  accepting: true, slot_min: 30, stay_min: 120, cap_terrace: 60, cap_covered: 50,
  max_party: 20, last_before_close: 60, min_notice: 60, days_ahead: 60,
};

export const AREAS = ['terrace', 'covered'];
export const OCCASIONS = ['', 'birthday', 'family', 'business', 'party'];
export const STATUSES = ['pending', 'confirmed', 'seated', 'done', 'cancelled', 'no_show'];
