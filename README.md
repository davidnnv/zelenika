# Zelenika Beer Garden — веб апликација

React (Vite) сајт за пивската градина „Zelenika“ на Средно Водно, Скопје, со онлајн резервации, админ панел и push известувања.
Базата, најавата и известувањата се на **Supabase**.

- `/` — сајт: 3D Водно со градината, тераса, градината одозгора (дрон), кујна и бар, диџеј вечери, работно време, како до нас (МК/EN)
- `/rezervacija` — резервација во 3 чекори (ден и гости → време → податоци); се гледаат само термините со слободни места
- `/admin` — админ панел: резервации по ден (статуси, маса, повик/Viber, ажурирање во живо со звук), push известувања на телефон, капацитет, работно време, затворени денови

Без Supabase клучеви, при `npm run dev` апликацијата работи во **демо режим** (податоците се во прелистувачот).
Демо најава: `demo@zelenika.mk` / `demo`.

## Локално

```bash
npm install
npm run dev
```

## Поставување на Supabase

1. [supabase.com](https://supabase.com) → **New project** (регион: Central EU / Frankfurt).
2. **SQL Editor** → залепете ја целата содржина на `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user** → е-пошта и лозинка на сопственикот (штиклирајте *Auto Confirm User*).
4. Во **SQL Editor** (со вистинската е-пошта):
   ```sql
   insert into public.admins (user_id) select id from auth.users where email = 'sopstvenik@primer.mk';
   ```
5. **Authentication → Sign In / Providers → Email**: исклучете *Allow new users to sign up*.
6. **Push известувања** (телефонот на админот добива порака и кога апликацијата е затворена):
   1. Генерирајте клучеви на компјутер: `npx web-push generate-vapid-keys`.
   2. **Edge Functions → Deploy a new function → Via Editor**, име `push-new-reservation`, залепете `supabase/functions/push-new-reservation/index.ts`. Во поставките на функцијата исклучете **Verify JWT**.
   3. **Edge Functions → Secrets**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (на пр. `mailto:shale.bastion@gmail.com`) и `PUSH_SECRET` (долг случаен текст).
   4. Во **SQL Editor** (со вашиот project ref и истиот `PUSH_SECRET`):
      ```sql
      insert into private.config (key, value) values
        ('push_url', 'https://XXXX.supabase.co/functions/v1/push-new-reservation'),
        ('push_secret', 'ИСТИОТ-PUSH-SECRET')
      on conflict (key) do update set value = excluded.value;
      ```
7. **Project Settings → API**: копирајте *Project URL* и *anon public* клуч во `.env` (види `.env.example`), заедно со `VITE_VAPID_PUBLIC_KEY` (јавниот клуч од чекор 6.1).

### Вклучување известувања на телефонот на сопственикот

- **Android (Chrome):** отворете `/admin`, најавете се → **Вклучи известувања** → Дозволи.
- **iPhone (iOS 16.4+):** отворете го сајтот во Safari → Сподели → **Додај на почетен екран**, отворете ја апликацијата од почетниот екран, најавете се → **Вклучи известувања**.
- Копчето **Испрати пробно** проверува дали сè е поврзано.

## Објавување на Render

**New → Blueprint** → репозиториумот (`render.yaml` ги поставува безбедносните headers и рутите).
Во **Environment** внесете `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`.

## Безбедност

| Што | Како е решено |
|---|---|
| Лозинки | Supabase Auth (bcrypt); регистрациите се исклучени; админ се додава рачно |
| Админ рути | `/admin` бара најава **и** `is_admin()` во базата; одјава по 30 мин неактивност; пауза по 5 погрешни обиди; `noindex` |
| Сопствени податоци | RLS: јавноста не може да ги чита резервациите; само `get_availability` (слободни места, без лични податоци) и `create_reservation` |
| Капацитет | Базата сама проверува работно време, затворени денови, капацитет по простор (тераса / под тенда) и ги заклучува истовремените резервации |
| Rate limiting | Во базата: 5 резервации на час по IP, 3 активни по телефон, 60 вкупно за 10 мин |
| XSS / форми | React ескејпира сè; базата брише HTML тагови и контролни знаци, проверува формат и должина; honeypot поле против ботови |
| Push | Претплатите ги гледа/брише само админот за своите уреди; Edge функцијата прифаќа само барања со `PUSH_SECRET`; `VAPID_PRIVATE_KEY` е само во Supabase secrets |
| API клучеви | Само преку env; anon клучот е јавен по дизајн, `service_role` никогаш во прелистувачот (апликацијата одбива да стартува со него) |
| Безбедносни headers | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy (`render.yaml`, `security-headers.js`) |
| Изложени фајлови | Се објавува само `dist/`, без source maps |
| Тајни во git | `npm run scan:secrets` пред commit; `.env*` е во `.gitignore` |

## Што се менува каде

- Телефон, адреса, е-пошта, линк за мапи: `src/lib/config.js` (`BUSINESS`)
- Текстови и мени (МК/EN): `src/i18n.js`
- Фотографии: `public/photos/`
- Капацитет, работно време, затворени денови: од админ панелот → **Поставки**

---
Изработка: [IOMYS](https://iomys.onrender.com)
