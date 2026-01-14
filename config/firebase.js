const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();

// Optional: Configure Firestore settings
db.settings({ ignoreUndefinedProperties: true });

// Optional: Initialize Realtime Database if needed
// const realtimeDb = admin.database();

// Optional: Initialize Storage if needed
// const storage = admin.storage();

module.exports = { 
  admin, 
  db,
  // realtimeDb,
  // storage
};