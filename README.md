<div align="center">

<img src="images/icon-master.png" width="100" alt="Trackzo logo" />

# Trackzo

**Track it. Split it. Save it.**

A mobile-first expense tracker PWA built with pure HTML, CSS & JavaScript — powered entirely by Firebase Realtime Database. No frameworks, no build step, no external libraries.

[![Made with HTML/CSS/JS](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20JS-0F766E)](#)
[![Firebase Realtime DB](https://img.shields.io/badge/backend-Firebase%20Realtime%20DB-F59E0B)](#)
[![PWA Ready](https://img.shields.io/badge/PWA-installable-0F766E)](#)
[![License: MIT](https://img.shields.io/badge/license-MIT-lightgrey)](#license)

</div>

---

## ✨ Features

- 🔐 **Custom auth** — signup/login with SHA-256 hashed passwords, stored directly in Realtime Database (no Firebase Auth)
- 💸 **Expense tracking** — add, edit, delete; category, date, note, payment method (Cash/Online)
- 📅 **Month-wise view** with search and sort (by date or amount)
- 🔁 **Recurring expenses** — auto-added every month
- 📊 **Budgets** — total + category-wise, with live "money left" calculation and color-coded progress bars
- 📈 **Charts** — category breakdown & monthly trend, hand-drawn on `<canvas>` (zero chart libraries)
- 👥 **Shared groups** — create/join via a 6-digit code, add shared expenses, auto "who owes whom" settle-up, activity log
- 📝 **Notes** — standalone or attached to expenses, month-wise, searchable, editable
- 📤 **Export** — CSV and PDF (print-to-PDF), shareable via the native Share sheet
- 🌗 **Dark mode**
- 📱 **Installable PWA** — add to home screen on Android/iOS
- ✅ Empty states, confirmation dialogs, toasts, and loading indicators throughout

---

## 🛠️ Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no frameworks) |
| Backend | Firebase Realtime Database (only) |
| Auth | Custom — SHA-256 via Web Crypto API |
| Charts | Hand-rolled `<canvas>` rendering |
| Sharing | Web Share API |
| Installability | Web App Manifest (`manifest.json`) |

No npm, no bundler, no build step required.

---

## 🚀 Getting Started

### 1. Clone the repo
```bash
git clone https://github.com/<your-username>/trackzo.git
cd trackzo
```

### 2. Set up Firebase
1. Create a project at [Firebase Console](https://console.firebase.google.com)
2. Register a **Web App** (`</>` icon) and copy the config object
3. Paste your config into [`firebase-config.js`](./firebase-config.js)
4. Go to **Build → Realtime Database → Create Database** (start in test mode)
5. Open the **Rules** tab and paste in [`rules.json`](./rules.json), then publish

> ⚠️ Since this app uses custom auth (not Firebase Auth), database rules are intentionally left open (`read/write: true`) so requests work without an auth token. Passwords are hashed before storage, but this setup is best suited for personal/demo use — not a public multi-tenant launch. See the Security section below.

### 3. Run locally
Pick one:

```bash
# Option A — Python
python3 -m http.server 8000
# then visit http://localhost:8000

# Option B — VS Code
# Install the "Live Server" extension → right-click index.html → "Open with Live Server"

# Option C — Firebase Hosting (get a real shareable URL)
npm install -g firebase-tools
firebase login
firebase init hosting   # point it at this folder
firebase deploy
```

> Must be served over `http://` or `https://` — opening `index.html` directly via `file://` will break Firebase and the Web Share API.

### 4. Install on your phone
Once deployed to a URL:
- **Android (Chrome)** → ⋮ menu → "Add to Home screen"
- **iPhone (Safari)** → Share button → "Add to Home Screen"

---

## 📁 Project Structure

```
trackzo/
├── index.html          # All app screens (SPA)
├── style.css            # Styling — light/dark theme, teal/amber branding
├── app.js                # All app logic (auth, expenses, budgets, groups, charts...)
├── firebase-config.js   # Firebase project credentials (edit this)
├── manifest.json        # PWA manifest
├── rules.json            # Starter Firebase Realtime DB security rules
├── images/               # Icons & illustrations
└── README.md
```

---

## 🔒 Security Notes

- Passwords are hashed client-side with **SHA-256** before being written to the database — never stored in plain text.
- Because there's no Firebase Auth, Realtime Database rules can't scope reads/writes to a verified identity, so `rules.json` ships open by default.
- **For production or public use**, consider migrating to Firebase Authentication with per-user rules like:
  ```json
  ".read": "auth != null && auth.uid === $uid"
  ```
- Session state is kept in `sessionStorage` (cleared when the tab closes), not `localStorage`.

---

## 🗺️ Data Model

```
/users/{username}
    passwordHash, createdAt, totalBudget, categoryBudgets, activeGroupId

/expenses/{username}/{expenseId}
    amount, category, date, note, paymentMethod, timestamp

/recurring/{username}/{recurringId}
    amount, category, note, paymentMethod, dayOfMonth

/notes/{username}/{noteId}
    title, text, timestamp

/groups/{6digitCode}
    ownerUsername, name, createdAt
    members/{username}: true
    expenses/{expenseId}: { amount, category, date, note, paymentMethod, timestamp, addedBy, splitBetween }
    activity/{logId}: { username, action, details, timestamp }
```

---

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you'd like to change.

---

## 📄 License

MIT — free to use, modify, and distribute.

---

<div align="center">
Made with 💛 and ₹ — Trackzo
</div>
