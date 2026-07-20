# Trackzo Setup Guide

Track it. Split it. Save it.

## What's in this folder
```
index.html          Main app (all screens)
style.css            Styling (light + dark theme, teal/amber branding)
app.js                All app logic
firebase-config.js   ⚠️ Add your Firebase credentials here
manifest.json        Makes the app installable on your phone
rules.json            Starter Firebase Realtime Database rules
images/               All app icons & illustrations
README.md            This file
```

## 1. Set up Firebase (5 minutes)
1. Go to https://console.firebase.google.com and create a new project.
2. Inside the project, click the **</>** (Web) icon to register a web app.
3. Copy the `firebaseConfig` object it gives you.
4. Open `firebase-config.js` in this folder and paste your values in place of the `YOUR_...` placeholders.
5. In the Firebase console, go to **Build → Realtime Database → Create Database**. Start in test mode for now.
6. Once created, go to the **Rules** tab and paste in the contents of `rules.json`, then click **Publish**.

> ⚠️ **Security note:** Because this app uses a custom username/password system (not Firebase Auth), the Realtime Database rules in `rules.json` are intentionally open (`.read`/`.write: true`) so the app works without a real auth token. This is fine for personal use or a demo, but **anyone with your database URL could read/write your data**. Passwords are hashed (SHA-256) before storage, but for a production/public launch you should migrate to real Firebase Authentication with per-user security rules.

## 2. Run the app
Since it's plain HTML/CSS/JS, you just need to serve the folder you can't open `index.html` directly via `file://` because Firebase and Web Share API need `http(s)://`.

**Easiest options:**
- **VS Code**: install the "Live Server" extension, right-click `index.html` → "Open with Live Server"
- **Python**: run `python3 -m http.server 8000` in this folder, then visit `http://localhost:8000`
- **Firebase Hosting** (free, gives you a real URL to install on your phone):
  ```
  npm install -g firebase-tools
  firebase login
  firebase init hosting   (point it at this folder)
  firebase deploy
  ```

## 3. Install on your phone
Once the app is live on a URL (e.g. via Firebase Hosting or any static host):
- **Android (Chrome)**: open the URL → menu (⋮) → "Add to Home screen"
- **iPhone (Safari)**: open the URL → Share button → "Add to Home Screen"

## Features included
- Custom login/signup (SHA-256 hashed passwords, stored in Realtime DB)
- Add/edit/delete expenses amount, category, date, note, payment method (Cash/Online)
- Month-wise view, search, sort by date/amount
- Recurring monthly expenses (auto-added each month)
- Total + category-wise budgets with live "money left" calculation
- Category & monthly trend charts (hand-drawn on `<canvas>`, no libraries)
- Shared groups via 6-digit join code add/edit/delete shared expenses, leave group
- Split calculator automatic "who owes whom" settle-up
- Group activity log
- Standalone notes + notes on expenses, month-wise, searchable, editable
- Export month as CSV or PDF (print-to-PDF)
- Share expenses, notes, budget summaries, and group codes via the native Share sheet
- Dark mode, ₹ (INR) only
- Onboarding intro (first-time only), confirmation dialogs, toasts, loading states, empty states
- Installable as a home-screen app (manifest.json)

## Notes
- All amounts are in ₹ (INR) only, hardcoded.
- No external libraries are used anywhere auth hashing uses the browser's built-in Web Crypto API, charts are drawn on `<canvas>` manually, and sharing uses the native Web Share API.
