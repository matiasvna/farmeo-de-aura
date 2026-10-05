/**
 * ==============================================================================
 * CONFIGURACIÓN PÚBLICA DE FIREBASE (WEB CLIENT SDK)
 * ==============================================================================
 * Pega aquí las credenciales obtenidas de la consola de Firebase:
 * Proyecto -> Configuración del proyecto -> Tus apps -> SDK de configuración
 *
 * NOTA DE SEGURIDAD:
 * En Firebase, las credenciales web identifican el proyecto en el cliente.
 * La verdadera seguridad de la base de datos se rige por las reglas de Firestore
 * definidas en 'firestore.rules'.
 */

export const firebaseConfig = {
  apiKey: "AIzaSy_PLACEHOLDER_KEY",
  authDomain: "torneo-aura-ciclotron.firebaseapp.com",
  projectId: "torneo-aura-ciclotron",
  storageBucket: "torneo-aura-ciclotron.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};
