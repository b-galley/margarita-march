const firebaseConfig = {
  apiKey: 'AIzaSyAUZFk6aej9t9pcZNJcv5Ed5G60M24fwxs',
  authDomain: 'margarita-march.firebaseapp.com',
  databaseURL: 'https://margarita-march-default-rtdb.firebaseio.com',
  projectId: 'margarita-march',
  storageBucket: 'margarita-march.firebasestorage.app',
  messagingSenderId: '1021351070220',
  appId: '1:1021351070220:web:0ad4ea388e56c9f53bbc29',
};

firebase.initializeApp(firebaseConfig);

// No firebase.storage() — photos are stored as base64 directly in the Realtime Database
// (js/photos.js) to stay on the free Spark plan, no Blaze/billing account required.
export const db = firebase.database();
export const SERVER_TIMESTAMP = firebase.database.ServerValue.TIMESTAMP;
