# VERB App — Deployment Guide

> Next.js 14 + Supabase + Vercel + Slack Webhooks

---

## 1. Supabase Setup

### 1a. Create a project
1. Go to [supabase.com](https://supabase.com) → New Project
2. Name it `verb-tracker` (or anything you like)
3. Choose a region close to you

### 1b. Run the schema
1. In the Supabase dashboard, open **SQL Editor**
2. Paste the contents of `supabase/schema.sql` and click **Run**
3. Paste the contents of `supabase/seed.sql` and click **Run**
   - This creates all 7 clients and their products

### 1c. Grab your keys
From **Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL` — the Project URL (e.g. `https://xxxx.supabase.co`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the `anon` / `public` key
- `SUPABASE_SERVICE_ROLE_KEY` — the `service_role` key (**keep this secret**)

### 1d. Fix the upsert constraint
The Slack webhook route upserts on `(file_name, client_id)`. Add that constraint in Supabase:
```sql
ALTER TABLE assets ADD CONSTRAINT assets_file_name_client_id_key UNIQUE (file_name, client_id);
```

---

## 2. Local Development

```bash
cd verb-app
npm install

# Copy the env template and fill in your Supabase keys
cp .env.example .env.local
# Edit .env.local with your actual values

npm run dev
# → http://localhost:3000
```

---

## 3. Vercel Deployment

### 3a. Push to GitHub
```bash
git init
git add .
git commit -m "initial commit"
gh repo create verb-tracker --private --push --source=.
```

### 3b. Import on Vercel
1. Go to [vercel.com](https://vercel.com) → Add New Project
2. Import your `verb-tracker` GitHub repo
3. Framework: **Next.js** (auto-detected)
4. Add environment variables (from your `.env.local`):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Your service role key |
| `SLACK_SIGNING_SECRET` | From Slack app config |
| `SLACK_BOT_TOKEN` | Your bot token (`xoxb-...`) |
| `SLACK_CHANNEL_ID` | `C0843S6QRA8` |

5. Click **Deploy** — Vercel handles the build automatically

### 3c. Note your deployment URL
It will be something like `https://verb-tracker-abc123.vercel.app`

---

## 4. Slack App Setup

### 4a. Create a Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From Scratch
2. Name: `VERB Tracker` | Workspace: your team workspace

### 4b. Set OAuth scopes
Under **OAuth & Permissions → Bot Token Scopes**, add:
- `channels:history` — read messages in public channels
- `files:read` — access file metadata
- `channels:read` — list channels

Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`) → this is `SLACK_BOT_TOKEN`.

### 4c. Invite the bot to your channel
In Slack, go to `#creative-asset-submissions-only` and type:
```
/invite @VERB Tracker
```

### 4d. Enable Event Subscriptions
1. In your Slack app config, go to **Event Subscriptions** → toggle ON
2. Set **Request URL** to:
   ```
   https://<your-vercel-domain>/api/slack
   ```
3. Slack will send a challenge request — your deployed app responds automatically
4. Under **Subscribe to bot events**, add:
   - `message.channels`
5. Save Changes

### 4e. Copy the Signing Secret
From **Basic Information → App Credentials**, copy the **Signing Secret** → this is `SLACK_SIGNING_SECRET`.

Update this in your Vercel environment variables, then redeploy.

---

## 5. How Assets Flow In

Once everything is wired up:

1. A creator posts a video to `#creative-asset-submissions-only` with the naming convention:
   ```
   CLIENT-PRODUCT-TYPE-CREATOR-DATE.mp4
   e.g. BIOM-APW-UGC-DB-040726.mp4
   ```
2. Slack fires an event to `/api/slack`
3. The webhook parses the filename, looks up the client/product in Supabase, and inserts the asset as **Ready to Upload**
4. The dashboard refreshes (every 60 seconds) and shows the updated counts

### Filename Convention Quick Reference

| Segment | Example | Meaning |
|---|---|---|
| `BIOM` | Client code | Biom |
| `APW` | Product code | All Purpose Wipes |
| `UGC` | Content type | User-Generated Content |
| `DB` | Creator code | David Butler |
| `040726` | Date (MMDDYY) | April 7, 2026 |

**Client codes:** BIOM, CHOMPS, HIMA, HL, DUPES, FLAV, FTUB  
**Type codes:** UGC, BLS, PD, CRL, TREV, TUT, TRD, PROMO  
**Creator codes:** DB, MA, MP, DY, JM, LR

---

## 6. Updating Asset Statuses

The simplest approach is the Supabase Table Editor:
1. Go to your Supabase project → **Table Editor → assets**
2. Click any cell to edit `status`, `notes`, etc.

Or use the API directly:
```bash
# Mark an asset as Live
curl -X PATCH "https://your-app.vercel.app/api/assets?id=<asset-uuid>" \
  -H "Content-Type: application/json" \
  -d '{"status": "Live / Running"}'
```

---

## 7. Troubleshooting

| Issue | Fix |
|---|---|
| Dashboard shows no clients | Run `seed.sql` in Supabase SQL Editor |
| Slack webhook not firing | Check Event Subscriptions URL, ensure bot is in channel |
| Upsert errors on Slack route | Run the `ALTER TABLE` constraint SQL from step 1d |
| `SUPABASE_SERVICE_ROLE_KEY` errors | Make sure it's set in Vercel env vars (not just locally) |
| Build fails on Vercel | Check TypeScript errors locally with `npm run build` first |
