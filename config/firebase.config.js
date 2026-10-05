/**
 * ==============================================================================
 * CONFIGURACIÓN DE FIREBASE (PLANTILLA PRIVADA / SERVIDOR)
 * ==============================================================================
 * Aquí se definen los parámetros de conexión de Firebase.
 * Si usas un bundler o Node.js, estos valores pueden leerse desde process.env.
 */

export const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "AIzaSy_PLACEHOLDER_KEY",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "torneo-aura-ciclotron.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "torneo-aura-ciclotron",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "torneo-aura-ciclotron.appspot.com",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: process.env.FIREBASE_APP_ID || "1:1234567890:web:abcdef123456"
};
