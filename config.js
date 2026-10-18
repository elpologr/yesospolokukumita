// Configuración de la conexión con Google Sheets.
// Sigue los pasos del README para obtener estos valores.
const CONFIG = {
  // URL de la aplicación web de Apps Script (termina en /exec)
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbyEIqynZdC6DSAfrlWe2BT49z20ao0QNEFTbhXk3GE057hB3tgl7DCAnQZfCxVbQ2FV/exec",
  // Debe ser EXACTAMENTE igual al TOKEN de google-apps-script.gs
  TOKEN: "polodulce",
  // ID de cliente de Google para "Iniciar sesión con Google" (termina en
  // .apps.googleusercontent.com). Sigue los pasos del README. Si lo dejas vacío,
  // la barra lateral avisa que falta configurarlo.
  GOOGLE_CLIENT_ID: "76727611900-lv1baflcpv7fni9a3op4drbctjnjbkad.apps.googleusercontent.com",
  // Configuración web de Firebase (Consola de Firebase → Configuración del proyecto →
  // Tus apps → Configuración del SDK). Estos valores no son secretos: la seguridad
  // real se define en las reglas de Firebase y en los dominios autorizados.
  FIREBASE: {
    apiKey: "AIzaSyCoT7ZFjO4OpPehvkXCwaOF8mJ6klkUwI0",
    authDomain: "velas-kukumita.firebaseapp.com",
    projectId: "velas-kukumita",
    storageBucket: "velas-kukumita.firebasestorage.app",
    messagingSenderId: "76727611900",
    appId: "1:76727611900:web:da40bc149218251140c279",
    measurementId: "G-MRT0EXFSG3",
  },
};
