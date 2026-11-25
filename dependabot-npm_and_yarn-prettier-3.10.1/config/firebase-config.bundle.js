// config/firebase-config.js
import {
  getApp,
  getApps,
  initializeApp
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  indexedDBLocalPersistence,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  verifyBeforeUpdateEmail
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
var firebaseConfig = {
  apiKey: "",
  authDomain: "esv-bible-6dffb.firebaseapp.com",
  databaseURL: "https://esv-bible-6dffb-default-rtdb.firebaseio.com",
  projectId: "esv-bible-6dffb",
  storageBucket: "esv-bible-6dffb.firebasestorage.app",
  messagingSenderId: "",
  appId: ""
};
var FIREBASE_DB_URL = firebaseConfig.databaseURL;
var firebaseApp = null;
var authInitializationPromise = null;
var appCheckInitializationPromise = null;
var databaseInitializationPromise = null;
function getFirebaseApp() {
  if (firebaseApp) return firebaseApp;
  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  return firebaseApp;
}
function initializeFirebaseAuth() {
  if (authInitializationPromise) return authInitializationPromise;
  authInitializationPromise = (async () => {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    const ready = setPersistence(auth, indexedDBLocalPersistence).catch(() => setPersistence(auth, browserLocalPersistence)).catch(() => setPersistence(auth, browserSessionPersistence)).catch((error) => {
      console.warn("Firebase auth persistence unavailable", error);
    });
    await ready;
    return {
      ready,
      onAuthStateChanged: (callback) => onAuthStateChanged(auth, callback),
      signInWithEmailAndPassword: (email, password) => signInWithEmailAndPassword(auth, email, password),
      createUserWithEmailAndPassword: (email, password) => createUserWithEmailAndPassword(auth, email, password),
      signOut: () => signOut(auth),
      createCredential: (email, password) => EmailAuthProvider.credential(email, password),
      reauthenticateWithCredential: (user, credential) => reauthenticateWithCredential(user, credential),
      verifyBeforeUpdateEmail: (user, email) => verifyBeforeUpdateEmail(user, email),
      updatePassword: (user, password) => updatePassword(user, password),
      sendPasswordResetEmail: (email) => sendPasswordResetEmail(auth, email),
      get currentUser() {
        return auth.currentUser;
      }
    };
  })();
  return authInitializationPromise;
}
function initializeFirebaseAppCheck(app) {
  if (appCheckInitializationPromise) return appCheckInitializationPromise;
  appCheckInitializationPromise = import("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-check.js").then(({ initializeAppCheck, ReCaptchaV3Provider }) => initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(
      "6Lf8bAAtAAAAALvK77sjk7750S7XVUQR7Ai2cXXV"
    ),
    isTokenAutoRefreshEnabled: true
  }));
  return appCheckInitializationPromise;
}
function initializeFirebaseDatabase() {
  if (databaseInitializationPromise) return databaseInitializationPromise;
  databaseInitializationPromise = (async () => {
    const app = getFirebaseApp();
    await initializeFirebaseAppCheck(app);
    const {
      get,
      getDatabase,
      onValue,
      ref,
      set
    } = await import("https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js");
    const database = getDatabase(app);
    function makeRef(path) {
      const databaseRef = ref(database, path);
      return {
        once: () => get(databaseRef),
        set: (value) => set(databaseRef, value),
        ref: (subpath) => makeRef(path ? `${path}/${subpath}` : subpath)
      };
    }
    return {
      ref: (path) => makeRef(path),
      onConnected: (callback) => onValue(
        ref(database, ".info/connected"),
        (snapshot) => callback(Boolean(snapshot.val()))
      )
    };
  })();
  return databaseInitializationPromise;
}
export {
  FIREBASE_DB_URL,
  initializeFirebaseAuth,
  initializeFirebaseDatabase
};
