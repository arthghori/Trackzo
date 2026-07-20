// ============================================================
// TRACKZO — Firebase Configuration
// ============================================================
// 1. Go to https://console.firebase.google.com
// 2. Create a project (or use an existing one)
// 3. Add a Web App to the project (</> icon)
// 4. Go to Build > Realtime Database > Create Database
//    -> Start in TEST MODE for development (change rules before
//       going live — see rules.json in this folder for a starter)
// 5. Copy your config object from Project Settings and paste
//    the values below.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyAJsDUv7xULFzUj7af4Hq1UCvZ-TrmyX0Q",
  authDomain: "trackzo-20f61.firebaseapp.com",
  databaseURL: "https://trackzo-20f61-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "trackzo-20f61",
  storageBucket: "trackzo-20f61.firebasestorage.app",
  messagingSenderId: "889717748939",
  appId: "1:889717748939:web:90135ff520252b1c29174e"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
