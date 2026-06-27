import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKwSXZumNyIZZ-8ve35A10-MHwANGzB0s",
  authDomain: "my-id-eas.firebaseapp.com",
  projectId: "my-id-eas",
  storageBucket: "my-id-eas.firebasestorage.app",
  messagingSenderId: "333412855530",
  appId: "1:333412855530:web:d072f7ec3470a7365db193"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };