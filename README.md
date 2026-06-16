# Wryze.ai Research Agent — Milestone 1

A tiny web app. You type an SAT topic, it searches the web (Tavily), sends the
results to Claude, and shows you a short summary. That's the whole pipeline.

No database, no login, no extra pages — that's intentional for Milestone 1.

---

## What's in this project

| File | What it does (plain English) |
|------|------------------------------|
| `package.json` | The shopping list of code libraries the app needs. |
| `next.config.mjs` | Basic settings for Next.js. You won't touch it. |
| `.gitignore` | Tells Git which files to never upload (like your secret keys). |
| `.env.local.example` | A template for your secret API keys. |
| `app/layout.js` | The outer shell of every page (title, fonts). |
| `app/globals.css` | The styling (colors, spacing, fonts). |
| `app/page.js` | The page you see: the input box, button, and results. |
| `app/api/research/route.js` | The "engine room" — runs on the server, calls Tavily and Claude. Keys live here, hidden from the browser. |

---

## Your two keys

This app uses exactly two secret keys, stored in a file called `.env.local`:

- `ANTHROPIC_API_KEY` — for Claude. Get it at https://console.anthropic.com (API Keys).
- `TAVILY_API_KEY` — for web search. Get it at https://app.tavily.com (API Keys; free tier available).

### How to add your keys (plain English)

`.env.local` is just a plain text file where the app keeps your private keys.
The app reads it automatically, and `.gitignore` makes sure it is never uploaded
anywhere. The name starts with a dot on purpose.

1. In the `wryze-research-agent` folder, create a new file named exactly `.env.local`
2. Paste these two lines into it:

   ```
   ANTHROPIC_API_KEY=your-anthropic-key-here
   TAVILY_API_KEY=your-tavily-key-here
   ```

3. Replace the placeholder text after each `=` with your real keys.
   No quotes, no spaces around the `=`. Save the file.

> On Mac TextEdit: choose Format → Make Plain Text first.
> On Windows Notepad: when saving, set "Save as type" to "All Files" so it does
> not become `.env.local.txt`.

---

## Run it locally

You need Node.js first. Download the "LTS" version from https://nodejs.org and
install it. Check it worked by opening Terminal (Mac) or PowerShell (Windows) and typing:

```bash
node -v
```

Then, in Terminal/PowerShell:

1. Go into the folder (tip: type `cd ` then drag the folder onto the window):
   ```bash
   cd Desktop/wryze-research-agent
   ```
2. Install the libraries:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. Open your browser to **http://localhost:3000**.

Stop the app anytime with `Ctrl + C`.

---

## Deploy to Vercel

1. Put this project on GitHub (GitHub Desktop is easiest: Add Existing Repository →
   point at this folder → Publish). Your `.env.local` is NOT uploaded — that's correct.
2. Go to https://vercel.com, sign in with GitHub, click **Add New → Project**, pick the repo.
3. Before deploying, open **Environment Variables** and add the same two keys:
   - `ANTHROPIC_API_KEY` = your key
   - `TAVILY_API_KEY` = your key
4. Click **Deploy**. You get a live URL in about a minute.

> Changed a key later? Redeploy from the Vercel dashboard so the new value takes effect.

---

## Testing checklist

- [ ] `npm install` finished without red errors.
- [ ] `.env.local` exists and has both real keys filled in.
- [ ] `npm run dev` starts and shows `http://localhost:3000`.
- [ ] The page loads with the title and input box (idle state).
- [ ] Typing a topic and clicking the button shows the **loading** message.
- [ ] After a few seconds you get a **summary** plus a few source links (success).
- [ ] Clicking with an empty box does nothing (no crash).
- [ ] A wrong key shows a friendly **error** message, not a crash.

---

## Common errors and fixes

| What you see | What it means | Fix |
|--------------|---------------|-----|
| `command not found: npm` | Node.js isn't installed. | Install from nodejs.org, then reopen Terminal/PowerShell. |
| "missing API keys" | `.env.local` is missing or empty. | Create it from the template and paste both keys. Restart `npm run dev`. |
| "Web search failed" | Tavily key is wrong, or out of free credits. | Re-check the key at app.tavily.com. No spaces/quotes. |
| "Summary failed" | Anthropic key is wrong or has no credit. | Check it at console.anthropic.com and ensure the account has credit. |
| Tavily `401 Unauthorized` | Key wasn't accepted. | The app sends it as `Authorization: Bearer <key>`. Just confirm the key is correct. |
| `model not found` | The Claude model name changed. | Open `app/api/research/route.js`, find the line marked `=== MODEL NAME ===`, update it. |
| Changes don't show up | Old code cached. | Stop with `Ctrl + C` and run `npm run dev` again. |
| Works locally, not on Vercel | Keys weren't added to Vercel. | Add both env vars in Vercel settings, then redeploy. |
