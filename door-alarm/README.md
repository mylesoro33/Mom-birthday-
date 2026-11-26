# 🚪 Door Alarm

A small web app that rings your phone **loudly, through Silent mode and Do Not Disturb**, when your DoorDash order arrives.

DoorDash has no consumer API, so Door Alarm watches your Gmail (read-only) for DoorDash emails. When one contains an arrival phrase ("has arrived", "is outside", "delivered", "your Dasher is here"), it sends a **Pushover emergency alert**: priority 2, repeated every 30 seconds for up to 5 minutes, with a loud sound, until you acknowledge it.

```
Gmail ──(every minute)──▶ /api/cron/poll ──▶ match phrase ──▶ Pushover priority 2 ──▶ 📱 ALARM
          from:doordash.com only                cooldown, quiet hours              repeats until acknowledged
```

**Pages**

| Page | What it does |
| --- | --- |
| **Connect** | Sign in with Google, save your Pushover user key and app token, and see the Gmail status |
| **Settings** | On/off switch, arrival phrases, ignore phrases (filters out marketing emails), sound, cooldown (default 20 min), quiet hours, and time zone |
| **Test** | A **Send test alarm** button, with live "Ringing / Acknowledged" status and a Stop button |
| **Log** | The last 20 detections, alarms, suppressed alarms (cooldown or quiet hours), and errors, plus a **Check now** button |

## Privacy and security

- **Gmail scope is `gmail.readonly`.** The Gmail search itself is `from:doordash.com -category:promotions`, so other mail is never listed or fetched. The sender is checked again on every message.
- **Email bodies are never downloaded.** Messages are fetched with `format=metadata`: only the From and Subject headers and Gmail's short preview snippet. The snippet is used in memory for matching and is never stored or logged. Only the subject line is saved, in the Log.
- **Secrets are encrypted at rest.** The Google refresh token, Pushover user key and Pushover app token are encrypted with AES-256-GCM using `ENCRYPTION_KEY` before they're stored.
- **Single owner.** Only `ALLOWED_EMAIL` can sign in. Sessions are signed, httpOnly cookies. The poll endpoint requires `CRON_SECRET`.
- **Disconnect Gmail** on the Connect page revokes Google's access token.

---

## Setup

You'll need about 20 minutes. Where you deploy, the app's address will be something like `https://door-alarm-yourname.vercel.app`. This README calls it **APP_URL**.

### 1. Pushover account (phone side)

1. Create an account at **https://pushover.net** and install the **Pushover** app on your phone (iOS or Android). Log in to the app. Pushover is a one-time purchase per platform after a 30-day trial.
2. On the pushover.net dashboard, copy **Your User Key**.
3. Go to **https://pushover.net/apps/build** and create an application (for example, name "Door Alarm"). Copy its **API Token/Key**.

### 2. Let Pushover break through Silent and Do Not Disturb

**iPhone: enable Critical Alerts**

1. Open the Pushover app. If it asks to allow **Critical Alerts**, tap **Allow**.
2. Then go to **Settings → Notifications → Pushover**, and make sure **Allow Notifications**, **Critical Alerts**, **Time Sensitive Notifications** and **Sounds** are all on.
3. In the Pushover app's settings, check that emergency-priority messages are set to use Critical Alerts. With that on, priority-2 messages play at full volume even with the Ring/Silent switch on silent.

**iPhone: allow Pushover in your Focus modes**

Critical Alerts already bypass Focus. Adding Pushover as an allowed app is a belt-and-braces step that also makes sure the banner shows:

1. **Settings → Focus → Do Not Disturb** (repeat for **Sleep**, **Work**, **Driving**, and any custom Focus you use).
2. **Apps → Add Apps → Pushover**, so it's in the **Allowed** list.
3. On the same screen, turn on **Time Sensitive Notifications**.

**Android**

1. In the Pushover app, open **Settings** and enable the options to override silent mode and Do Not Disturb for **emergency priority** messages.
2. In Android **Settings → Notifications → Do Not Disturb → Apps**, add **Pushover**.
3. If Android asks to grant Pushover **Do Not Disturb access** or to **ignore battery optimizations**, allow both.

You'll confirm all of this with the Test page in step 7.

### 3. Database

Any Postgres works. The easiest option on Vercel is **Neon**:

1. In your Vercel project, go to **Storage → Create Database → Neon (Postgres)** and connect it to the project.
2. This sets `DATABASE_URL` for you. Use the **pooled** connection string if you're asked to choose.

Tables are created automatically on the first request.

### 4. Google OAuth credentials

1. Go to **https://console.cloud.google.com** and create a project (for example, "Door Alarm").
2. **APIs & Services → Library**: search for **Gmail API** and click **Enable**.
3. **APIs & Services → OAuth consent screen** (in newer consoles: **Google Auth Platform → Branding / Audience / Data access**):
   - User type: **External**.
   - App name "Door Alarm", plus your email as the support and developer contact.
   - **Data access / Scopes**: add `.../auth/gmail.readonly`, `openid` and `.../auth/userinfo.email`.
   - **Audience / Test users**: add your own Gmail address.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs: `APP_URL/api/auth/callback`, for example `https://door-alarm-yourname.vercel.app/api/auth/callback`. For local development, also add `http://localhost:3000/api/auth/callback`.
   - Copy the **Client ID** and **Client secret**.

> ⚠️ **The 7-day token gotcha.** While an External app's publishing status is **Testing**, Google expires its refresh tokens after **7 days**, so Door Alarm would stop working every week. Door Alarm will show **Needs sign-in** and log an error when that happens. To avoid it, go to **Audience → Publish app → In production**. For a personal app used only by you, you don't need to submit it for verification. When you sign in, Google shows an "unverified app" warning; click **Advanced → Go to Door Alarm (unsafe)**. That's expected, because you are the developer. If you use a Google Workspace account, choose **Internal** instead, which has no expiry and no warning.

### 5. Deploy on Vercel

1. Push this repo to GitHub and **Import** it in Vercel.
2. Set **Root Directory** to `door-alarm`. The framework preset is auto-detected as Next.js.
3. Add these **Environment Variables** (also listed in `.env.example`):

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Set by the Neon integration |
   | `APP_URL` | `https://door-alarm-yourname.vercel.app`, with no trailing slash |
   | `GOOGLE_CLIENT_ID` | From step 4 |
   | `GOOGLE_CLIENT_SECRET` | From step 4 |
   | `ALLOWED_EMAIL` | Your Gmail address. Only this account can sign in |
   | `ENCRYPTION_KEY` | Output of `openssl rand -base64 32`. **Don't change it later**, or saved tokens can't be decrypted and you'll have to reconnect |
   | `SESSION_SECRET` | Output of `openssl rand -base64 32` |
   | `CRON_SECRET` | Output of `openssl rand -hex 24` |

4. Deploy. If the final URL differs from what you guessed, update `APP_URL` and the Google redirect URI, then redeploy.

### 6. Run the check every minute

The poller is `GET APP_URL/api/cron/poll` with the header `Authorization: Bearer <CRON_SECRET>`. Pick one way to call it.

**Option A: free external cron (works on Vercel's free Hobby plan).** Vercel Hobby only allows cron jobs once a day, so use a free scheduler such as **https://cron-job.org**:

1. Create a cron job with URL `APP_URL/api/cron/poll`, scheduled **every 1 minute**.
2. Under **Advanced → Headers**, add `Authorization` with the value `Bearer YOUR_CRON_SECRET`.
3. Save, then use **Test run**. It should return something like `{"status":"ok","checked":0,"alerts":0}`.

**Option B: Vercel Cron (Vercel Pro plan).** Create `door-alarm/vercel.json` and redeploy:

```json
{ "crons": [{ "path": "/api/cron/poll", "schedule": "* * * * *" }] }
```

Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when that variable is set. (Don't add this file on Hobby: a deployment with a per-minute cron is rejected there.)

> **Why not Gmail push (Pub/Sub)?** It's faster than one minute in theory, but it needs a Pub/Sub topic, IAM grants, and a `users.watch` renewal at least every 7 days. A one-minute poll is simpler and reliable, and it's well within Gmail's quotas.

### 7. Connect and test

1. Open **APP_URL** on your phone and tap **Sign in with Google**. Approve the read-only Gmail permission and make sure its checkbox is ticked.
2. Paste your Pushover **user key** and **app token**, then tap **Save Pushover keys**.
3. Optional: add the app to your home screen (Share → **Add to Home Screen**).
4. Put your phone on **Silent**, turn on **Do Not Disturb** or your usual Focus, and lock it.
5. Go to **Test → Send test alarm**. It should blare within a few seconds and repeat every 30 seconds until you open it in Pushover and tap **Acknowledge**. The Test page then shows **Acknowledged**.

If it doesn't break through, re-check step 2.

---

## How detection works

- Each poll searches Gmail for `from:doordash.com -category:promotions` mail received since you connected (looking back at most 2 hours). Each message id is processed only once.
- The email's subject and preview are checked against your **arrival phrases**, ignoring case. If it also contains an **ignore phrase** (by default `% off`, `promo`, `deal`, `dashpass`, `free delivery`, `save $`), it's skipped. This keeps "groceries delivered fast, 40% off" from waking you up.
- A match is logged as **Detected**. Then the alarm is **Not rung** if:
  - the email is more than 30 minutes old (for example, after downtime),
  - an alarm was already sent within the **cooldown** (default 20 minutes),
  - it's within **quiet hours**, or
  - another alarm was already sent in the same poll.
- Otherwise, Pushover is called with `priority=2`, `retry=30`, `expire=300` and your chosen sound (default **Persistent**, a long, loud tone). Live acknowledgement status shows on the Log page, with a **Stop** button.
- Turning the switch **off** stops all Gmail access. Turning it back on only watches mail that arrives from then on.

> **About timing:** Door Alarm can only be as fast as DoorDash's email plus the one-minute poll. DoorDash doesn't send an email for every status change, and the "delivered" email sometimes arrives after drop-off. Use the **Log** to see which emails you actually get, and tune the phrases to match. If you see an email that should have matched, add a phrase from its subject.

## Local development

```bash
cd door-alarm
cp .env.example .env.local   # fill in values; APP_URL=http://localhost:3000
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (matching, quiet hours, crypto)

# trigger a poll by hand (or use "Check now" on the Log page)
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/poll
```

For a local Postgres, use `DATABASE_URL=postgres://postgres@localhost:5432/door_alarm`. SSL is turned off automatically for localhost.

## Project layout

```
src/app/connect|settings|test|log   pages (server components)
src/app/actions.ts                  server actions (save settings, test alarm, stop, check now)
src/app/api/auth/*                  Google OAuth (manual flow, offline access)
src/app/api/cron/poll               poll endpoint (CRON_SECRET-protected)
src/lib/poll.ts                     detection pipeline
src/lib/gmail.ts                    Gmail list + metadata fetch (no bodies)
src/lib/pushover.ts                 emergency alerts, receipts, cancel
src/lib/store.ts, db.ts             Postgres (auto-migrating), encrypted secrets
```
