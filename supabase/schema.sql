-- =====================================================================
-- Zelenika Beer Garden — база на податоци за Supabase
-- Пуштете го целиот фајл во Supabase → SQL Editor → Run.
-- Безбедно е да се пушти повторно (сè е "if not exists" / "or replace").
-- Времињата се минути од полноќ во локално време (Europe/Skopje), на пр. 19:30 = 1170, полноќ = 1440.
-- =====================================================================

create extension if not exists pg_net with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------- Табели ----------

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Поставки (еден ред, id = 1)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  accepting boolean not null default true,                                   -- примаме онлајн резервации
  slot_min int not null default 30 check (slot_min in (15, 30, 60)),          -- на колку минути се нудат термини
  stay_min int not null default 120 check (stay_min between 30 and 360),      -- колку долго маса е зафатена
  cap_terrace int not null default 60 check (cap_terrace between 0 and 1000), -- гости одеднаш на отворена тераса
  cap_covered int not null default 50 check (cap_covered between 0 and 1000), -- гости одеднаш под тендата
  max_party int not null default 20 check (max_party between 1 and 200),      -- најголема група онлајн
  last_before_close int not null default 60 check (last_before_close between 0 and 300),
  min_notice int not null default 60 check (min_notice between 0 and 1440),   -- најмалку минути однапред
  days_ahead int not null default 60 check (days_ahead between 1 and 365)
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.opening_hours (
  weekday int primary key check (weekday between 0 and 6),   -- 0 = недела
  is_open boolean not null default true,
  open_min int not null default 600 check (open_min between 0 and 1440),
  close_min int not null default 1320 check (close_min between 0 and 1440),
  check (close_min > open_min)
);
insert into public.opening_hours (weekday, is_open, open_min, close_min) values
  (0, true, 600, 1320), (1, true, 600, 1305), (2, true, 600, 1305), (3, true, 600, 1305),
  (4, true, 600, 1305), (5, true, 600, 1440), (6, true, 600, 1440)
on conflict (weekday) do nothing;

create table if not exists public.blocked_days (
  day date primary key,
  note text not null default '' check (char_length(note) <= 120)
);

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  start_min int not null check (start_min between 0 and 1440),
  guests int not null check (guests between 1 and 200),
  area text not null check (area in ('terrace', 'covered')),
  area_pref text not null default 'any' check (area_pref in ('terrace', 'covered', 'any')),
  name text not null check (char_length(name) between 1 and 80),
  phone text not null check (char_length(phone) between 6 and 30),
  email text not null default '' check (char_length(email) <= 120 and (email = '' or email ~* '^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$')),
  note text not null default '' check (char_length(note) <= 500),
  occasion text not null default '' check (occasion in ('', 'birthday', 'family', 'business', 'party')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'seated', 'done', 'cancelled', 'no_show')),
  table_label text not null default '' check (char_length(table_label) <= 20),
  lang text not null default 'mk' check (lang in ('mk', 'en')),
  created_at timestamptz not null default now()
);
create index if not exists reservations_day_idx on public.reservations (day, start_min);

-- Push претплати на админите (телефон/компјутер што прима известувања)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  device text not null default '' check (char_length(device) <= 80),
  created_at timestamptz not null default now()
);

-- Rate limiting (не е достапно преку API)
create table if not exists private.attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  phone_digits text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists attempts_ip_idx on private.attempts (ip, created_at);

-- Тајни за push (адреса на функцијата и заедничка тајна). Пополнете ги по README чекор 6.
create table if not exists private.config (key text primary key, value text not null);

-- ---------- Помошни функции ----------

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.clean_text(p text, p_max int)
returns text language sql immutable set search_path = public as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''), '<[^>]*>', '', 'g'), '[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]', '', 'g'), '[<>]', '', 'g')), p_max);
$$;

create or replace function public.request_ip()
returns text language sql stable set search_path = public as $$
  select coalesce(
    nullif(split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), ''),
    current_setting('request.headers', true)::json ->> 'cf-connecting-ip',
    'unknown');
$$;

-- Гости што седат во даден интервал, по простор
create or replace function public.load_at(p_day date, p_start int, p_end int, p_area text)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(r.guests), 0)::int from public.reservations r, public.settings s
  where s.id = 1 and r.day = p_day and r.area = p_area
    and r.status in ('pending', 'confirmed', 'seated')
    and r.start_min < p_end and r.start_min + s.stay_min > p_start;
$$;

-- Слободни места по термин за еден ден — јавно, БЕЗ лични податоци.
create or replace function public.get_availability(p_day date)
returns table (start_min int, terrace_left int, covered_left int)
language plpgsql stable security definer set search_path = public as $$
declare
  s public.settings%rowtype;
  h public.opening_hours%rowtype;
  v_now timestamp := (now() at time zone 'Europe/Skopje');
  v_now_min int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  t int;
begin
  select * into s from public.settings where id = 1;
  if not s.accepting or p_day < v_now::date or p_day > v_now::date + s.days_ahead then return; end if;
  if exists (select 1 from public.blocked_days where day = p_day) then return; end if;
  select * into h from public.opening_hours where weekday = extract(dow from p_day)::int;
  if not found or not h.is_open then return; end if;
  t := h.open_min + ((s.slot_min - h.open_min % s.slot_min) % s.slot_min);
  while t <= h.close_min - s.last_before_close loop
    if not (p_day = v_now::date and t < v_now_min + s.min_notice) then
      start_min := t;
      terrace_left := greatest(0, s.cap_terrace - public.load_at(p_day, t, t + s.stay_min, 'terrace'));
      covered_left := greatest(0, s.cap_covered - public.load_at(p_day, t, t + s.stay_min, 'covered'));
      return next;
    end if;
    t := t + s.slot_min;
  end loop;
end;
$$;

-- Нова резервација од сајтот. Сè се проверува на серверот.
create or replace function public.create_reservation(
  p_day date, p_start_min int, p_guests int, p_area text,
  p_name text, p_phone text, p_email text, p_note text, p_occasion text, p_lang text default 'mk'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s public.settings%rowtype;
  h public.opening_hours%rowtype;
  v_now timestamp := (now() at time zone 'Europe/Skopje');
  v_now_min int := extract(hour from v_now)::int * 60 + extract(minute from v_now)::int;
  v_ip text := public.request_ip();
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_name text := public.clean_text(p_name, 80);
  v_email text := lower(public.clean_text(p_email, 120));
  v_pref text := case when p_area in ('terrace', 'covered') then p_area else 'any' end;
  v_area text;
  v_id uuid;
begin
  -- Rate limit: 5 обиди на час по IP, 3 активни идни резервации по телефон, 60 вкупно за 10 минути.
  if (select count(*) from private.attempts where ip = v_ip and created_at > now() - interval '1 hour') >= 5
     or (select count(*) from private.attempts where created_at > now() - interval '10 minutes') >= 60 then
    raise exception 'RATE_LIMIT';
  end if;
  if length(v_digits) >= 8 and (
    select count(*) from public.reservations
    where regexp_replace(phone, '\D', '', 'g') = v_digits and status in ('pending', 'confirmed') and day >= v_now::date
  ) >= 3 then
    raise exception 'RATE_LIMIT';
  end if;

  select * into s from public.settings where id = 1;
  if not s.accepting then raise exception 'NOT_ACCEPTING'; end if;
  if p_guests is null or p_guests < 1 or p_guests > s.max_party then raise exception 'PARTY_SIZE'; end if;
  if p_day is null or p_day < v_now::date or p_day > v_now::date + s.days_ahead then raise exception 'DAY_OUT_OF_RANGE'; end if;
  if exists (select 1 from public.blocked_days where day = p_day) then raise exception 'DAY_CLOSED'; end if;

  select * into h from public.opening_hours where weekday = extract(dow from p_day)::int;
  if not found or not h.is_open then raise exception 'DAY_CLOSED'; end if;
  if p_start_min is null or p_start_min % s.slot_min <> 0
     or p_start_min < h.open_min or p_start_min > h.close_min - s.last_before_close then
    raise exception 'OUTSIDE_HOURS';
  end if;
  if p_day = v_now::date and p_start_min < v_now_min + s.min_notice then raise exception 'TOO_SOON'; end if;

  if v_name = '' or length(v_digits) < 8 or length(v_digits) > 15 then raise exception 'MISSING_FIELDS'; end if;
  if v_email <> '' and v_email !~* '^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$' then raise exception 'MISSING_FIELDS'; end if;

  -- Заклучи го денот, па провери капацитет.
  perform pg_advisory_xact_lock(hashtext('zelenika-' || p_day::text));
  if v_pref in ('terrace', 'any') and public.load_at(p_day, p_start_min, p_start_min + s.stay_min, 'terrace') + p_guests <= s.cap_terrace then
    v_area := 'terrace';
  elsif v_pref in ('covered', 'any') and public.load_at(p_day, p_start_min, p_start_min + s.stay_min, 'covered') + p_guests <= s.cap_covered then
    v_area := 'covered';
  else
    raise exception 'FULL';
  end if;

  insert into public.reservations (day, start_min, guests, area, area_pref, name, phone, email, note, occasion, lang)
  values (p_day, p_start_min, p_guests, v_area, v_pref, v_name, public.clean_text(p_phone, 30), v_email,
          public.clean_text(p_note, 500),
          case when p_occasion in ('birthday', 'family', 'business', 'party') then p_occasion else '' end,
          case when p_lang = 'en' then 'en' else 'mk' end)
  returning id into v_id;

  insert into private.attempts (ip, phone_digits) values (v_ip, v_digits);
  delete from private.attempts where created_at < now() - interval '2 days';
  return v_id;
end;
$$;

-- Админ: зачувај push претплата за овој уред
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, public.clean_text(p_device, 80))
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device;
end;
$$;

-- ---------- Push: секоја нова резервација ја повикува Edge функцијата ----------

create or replace function private.send_push(p_payload jsonb)
returns void language plpgsql security definer set search_path = public, private, extensions as $$
declare
  v_url text := (select value from private.config where key = 'push_url');
  v_secret text := (select value from private.config where key = 'push_secret');
begin
  if v_url is null or v_secret is null then return; end if;   -- push уште не е поставен
  perform net.http_post(
    url := v_url,
    body := p_payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  null;   -- известувањето никогаш не смее да ја спречи резервацијата
end;
$$;

create or replace function private.on_new_reservation()
returns trigger language plpgsql security definer set search_path = public, private as $$
begin
  perform private.send_push(jsonb_build_object(
    'type', 'new',
    'id', new.id, 'day', new.day, 'start_min', new.start_min, 'guests', new.guests,
    'area', new.area, 'name', new.name, 'occasion', new.occasion));
  return new;
end;
$$;

drop trigger if exists reservations_push on public.reservations;
create trigger reservations_push after insert on public.reservations
  for each row execute function private.on_new_reservation();

-- Админ: пробно известување до сите уреди
create or replace function public.test_push()
returns boolean language plpgsql security definer set search_path = public, private as $$
begin
  if not public.is_admin() then raise exception 'NOT_ADMIN'; end if;
  if not exists (select 1 from private.config where key = 'push_url') then raise exception 'PUSH_NOT_CONFIGURED'; end if;
  perform private.send_push(jsonb_build_object('type', 'test'));
  return true;
end;
$$;

-- ---------- Права ----------

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function public.get_availability(date) to anon, authenticated;
grant execute on function public.create_reservation(date, int, int, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.test_push() to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.settings, public.opening_hours, public.blocked_days to anon, authenticated;
grant update on public.settings to authenticated;
grant select, insert, update, delete on public.opening_hours, public.blocked_days, public.reservations to authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant select on public.admins to authenticated;
revoke all on public.reservations, public.admins, public.push_subscriptions from anon;
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;

-- ---------- Row Level Security ----------

alter table public.admins enable row level security;
alter table public.settings enable row level security;
alter table public.opening_hours enable row level security;
alter table public.blocked_days enable row level security;
alter table public.reservations enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "public read settings" on public.settings;
create policy "public read settings" on public.settings for select using (true);
drop policy if exists "admin update settings" on public.settings;
create policy "admin update settings" on public.settings for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read hours" on public.opening_hours;
create policy "public read hours" on public.opening_hours for select using (true);
drop policy if exists "admin all hours" on public.opening_hours;
create policy "admin all hours" on public.opening_hours for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "public read blocked" on public.blocked_days;
create policy "public read blocked" on public.blocked_days for select using (true);
drop policy if exists "admin all blocked" on public.blocked_days;
create policy "admin all blocked" on public.blocked_days for all using (public.is_admin()) with check (public.is_admin());

-- Резервациите ги гледаат и менуваат САМО админите.
drop policy if exists "admin all reservations" on public.reservations;
create policy "admin all reservations" on public.reservations for all using (public.is_admin()) with check (public.is_admin());

-- Секој админ ги гледа и брише само своите уреди.
drop policy if exists "own push subs read" on public.push_subscriptions;
create policy "own push subs read" on public.push_subscriptions for select using (user_id = auth.uid() and public.is_admin());
drop policy if exists "own push subs delete" on public.push_subscriptions;
create policy "own push subs delete" on public.push_subscriptions for delete using (user_id = auth.uid() and public.is_admin());

drop policy if exists "admin read self" on public.admins;
create policy "admin read self" on public.admins for select using (user_id = auth.uid());

-- ---------- Нови резервации во живо во админ панелот ----------
do $$ begin
  alter publication supabase_realtime add table public.reservations;
exception when others then null; end $$;

-- ---------- Админ корисник ----------
-- 1) Authentication → Users → Add user (е-пошта + лозинка, штиклирајте Auto Confirm User).
-- 2) insert into public.admins (user_id) select id from auth.users where email = 'SOPSTVENIK@EMAIL.COM';
