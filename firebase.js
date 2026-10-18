// Inicializa Firebase (versión para páginas sin compilador: se carga desde el CDN de Google).
// La configuración vive en config.js (CONFIG.FIREBASE).
// Para usar más productos (Firestore, Auth, Storage...) agrega su import aquí abajo,
// con la MISMA versión que los demás.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import {
  getAnalytics,
  isSupported,
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-analytics.js";

const polo = { app: null, analytics: null };

try {
  if (typeof CONFIG === "undefined" || !CONFIG.FIREBASE || !CONFIG.FIREBASE.apiKey) {
    throw new Error("Falta CONFIG.FIREBASE en config.js");
  }
  polo.app = initializeApp(CONFIG.FIREBASE);

  // Analytics solo funciona en https/localhost y si el navegador lo permite
  // (por ejemplo, no al abrir el archivo con file://).
  isSupported()
    .then((ok) => {
      if (ok) polo.analytics = getAnalytics(polo.app);
    })
    .catch(() => {});
} catch (e) {
  console.warn("Firebase no se inició:", e.message);
}

// Disponible para el resto de la página como window.poloFirebase
window.poloFirebase = polo;
