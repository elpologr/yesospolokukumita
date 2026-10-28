// ══════════════════════════════════════════════════════════════
// Configuración de Yesos Polo Kukúmita.
// Aquí viven los valores que cambian según el entorno (links, IDs).
// Si mueves la hoja o creas un nuevo despliegue del Apps Script, solo editas
// este archivo y subes el cambio.
// Se carga ANTES que app.js (ver index.html). Si lo editas, sube también el
// número de versión de <script src="config.js?v=..."> en index.html.
// ══════════════════════════════════════════════════════════════
const CONFIG = {
  // URL de despliegue del Apps Script de Polo (CodePolo.gs). Termina en /exec.
  // Este sitio la usa para ELIMINAR productos (solo administradores). Además, el Apps Script
  // de Yesos Fer la usa para crear productos aquí: ese link debe estar también guardado en las
  // propiedades del script de Fer con el nombre URL_POLO.
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbzeeabV4HJVLAwb5OSeRMr7JlktjuIpX0S3AFfV5W3599tBY9JGmam-QDlUus08U_Rf8w/exec",

  // Hoja de cálculo del catálogo de Yesos Polo (pública, se lee como CSV vía gviz).
  SHEET_ID: "1LX-jUhxnbWYEQ8aa8cfbmCenWRYLGI8aHlojkfG7oNA",

  // Pestaña de ESA MISMA hoja con la info del modal "Búscanos en Bazar".
  SHEET_NOMBRE_BAZAR: "Hoja 2",

  // Hoja de cálculo de Velas Kukúmita (botón "Etiquetas" y zonas "Mostrar más").
  // La Hoja 1 se lee como pestaña por defecto; la segunda pestaña se llama:
  SHEET_ID_ETIQUETAS: "1jin2wMYingvbPD2csGxIbm5AhulfRvCRvIzAKJTUNMw",
  SHEET_NOMBRE_ETIQUETAS: "Hoja 2",

  // Cloudflare Worker para compartir en redes sociales (imagen en Facebook, etc.).
  // Déjalo vacío ("") para desactivarlo.
  OG_WORKER_URL: "https://yesos-polo-kukumita-linker.dulceprincesa086.workers.dev",

  // Configuración web de Firebase. Estos valores no son secretos: la seguridad real
  // está en las reglas de Firebase y en los dominios autorizados.
  FIREBASE: {
    apiKey: "AIzaSyBc_AUz1lfgAPFuQd9oKvDYGm1lyrHALGs",
    authDomain: "velas-kukumita.firebaseapp.com",
    projectId: "velas-kukumita",
    storageBucket: "velas-kukumita.firebasestorage.app",
    messagingSenderId: "76727611900",
    appId: "1:76727611900:web:d0f8b3c2a04e6fb340c279",
    measurementId: "G-RWNN074LVT",
  },

  // Correos con permiso de administrador (solo para MOSTRAR u ocultar el botón "Eliminar producto";
  // la verificación real la repite el servidor con CORREOS_ADMIN en CodePolo.gs, así que
  // si agregas uno aquí, agrégalo también allá).
  CORREOS_ADMIN: [
    "dulceprincesa086@gmail.com",
    "dulcefernandaguzmanrodriguez@gmail.com",
    "celvaguzman72@gmail.com",
    "celvapreciosa27@gmail.com",
    "velaskuku@gmail.com",
    "yesosferkukumita@gmail.com",
  ],
};
