// ---------- Control de versión ----------
// index.html, styles.css y app.js deben ser de la MISMA versión. Si no lo son,
// se muestra un aviso arriba de la página diciendo cuál archivo hay que volver a subir.
const VERSION = "38";

(function revisarArchivos() {
  const IDS_NECESARIOS = [
    "calendario", "cal-mes", "cal-anio", "cal-anterior", "cal-siguiente",
    "cal-hoy", "cal-actualizar", "cal-cuadricula", "cal-estado",
    "dia-popover", "pop-titulo", "pop-cerrar", "pop-secciones",
    "btn-menu-lateral", "barra-lateral", "google-boton", "btn-notas", "panel-notas",
    "notas-nueva-btn", "notas-fecha", "notas-cancelar", "notas-estado-lista",
    "notas-submenu", "notas-sub-lista", "notas-mas-colores", "notas-color-personal",
    "notas-identificador", "notas-form-titulo", "btn-proyectos", "panel-proyectos", "proy-form",
    "btn-yeso", "btn-galeria", "panel-galeria", "gal-form",
    "zona-actividades", "zona-trabajo", "btn-menu-notas", "seccion-notas", "btn-menu-ejercicio",
    "panel-ejercicio", "ej-cuadricula", "ej-dia", "ej-form",
    "btn-menu-diario", "panel-diario", "di-cuadricula", "di-dia", "di-form",
    "seccion-ejercicio", "seccion-diario", "di-ejercicios", "di-ej-detalle", "pedidos-yeso", "zona-pedidos-yeso",
    "pop-color", "pop-colores", "pop-mas-colores", "pop-paleta", "pop-color-personal",
    "btn-menu-deudas", "seccion-deudas", "panel-deudas", "de-chips", "de-form",
    "btn-menu-informacion", "seccion-informacion", "panel-informacion", "ip-chips", "ip-form", "ip-fecha",
    "btn-menu-comandos", "seccion-comandos", "panel-comandos", "cm-chips", "cm-form", "cm-fecha",
    "btn-menu-bazar", "seccion-bazar", "panel-bazar", "bz-chips", "bz-form", "bz-informacion",
    "btn-menu-hoy", "seccion-hoy", "panel-hoy", "hy-grupos", "hy-detalle", "hy-detalle-fin", "hy-detalle-estado",
  ];
  const problemas = [];

  const faltan = IDS_NECESARIOS.filter((id) => !document.getElementById(id));
  const meta = document.querySelector('meta[name="app-version"]');
  if (faltan.length || !meta || meta.content !== VERSION) problemas.push("index.html");

  const cssVersion = getComputedStyle(document.documentElement)
    .getPropertyValue("--app-version")
    .replace(/["'\s]/g, "");
  if (cssVersion !== VERSION) problemas.push("styles.css");

  if (!problemas.length) return;

  const aviso = document.createElement("div");
  aviso.style.cssText =
    "background:#fff3bf;color:#5c3d00;border-bottom:3px solid #f08c00;" +
    "padding:12px 16px;font:15px/1.4 system-ui,sans-serif;text-align:center;";
  aviso.textContent =
    "⚠️ Archivos desactualizados: " + problemas.join(" y ") +
    ". Sube de nuevo TODOS los archivos de la última versión (index.html, styles.css, " +
    "app.js y config.js) y recarga la página con Ctrl+F5 (en Mac: Cmd+Shift+R).";
  document.body.prepend(aviso);

  // Si falta algo del HTML, el resto del código no puede funcionar: se detiene aquí.
  if (faltan.length) throw new Error("index.html desactualizado. Faltan: " + faltan.join(", "));
})();

// ---------- Menú principal ----------
const botonesMenu = document.querySelectorAll(".btn-menu");
const secciones = document.querySelectorAll(".seccion");
const mensajeInicio = document.getElementById("inicio");

function mostrarSeccion(id) {
  // Si hay una nota a medias (en Notas o en una zona), se pregunta antes de salir
  if (!confirmarAbandonoEdicion()) return;
  mensajeInicio.hidden = true;
  secciones.forEach((s) => (s.hidden = s.id !== id));
  botonesMenu.forEach((b) =>
    b.classList.toggle("activo", b.dataset.seccion === id)
  );
  if (id === "calendario") irAHoy(); // siempre abre en la fecha actual
  else cerrarPopover();
  // La página de Notas se prepara al entrar (lista primero, sin formularios abiertos)
  panelNotas.hidden = id !== "seccion-notas";
  if (id === "seccion-notas") entrarNotas();
  // Ejercicio y Diario también son páginas: se preparan al entrar y se limpian al salir
  if (id === "seccion-ejercicio") entrarEjercicio();
  else cerrarEjercicio();
  if (id === "seccion-diario") entrarDiario();
  else cerrarDiario();
  // Deudas también es una página
  if (id === "seccion-deudas") entrarDeudas();
  else cerrarDeudas();
  // Información Primordial también es una página
  if (id === "seccion-informacion") entrarInformacion();
  else cerrarInformacion();
  // Comandos también es una página
  if (id === "seccion-comandos") entrarComandos();
  else cerrarComandos();
  // Bazar también es una página
  if (id === "seccion-bazar") entrarBazar();
  else cerrarBazar();
  // Día de Hoy también es una página
  if (id === "seccion-hoy") entrarHoy();
  else cerrarHoy();
  // Los Notarios se leen la primera vez que se ve una zona que los tiene
  if (typeof actualizarNotarios === "function") actualizarNotarios();
}

// Todos los botones del menú cambian de sección (Ejercicio y Diario también son páginas)
botonesMenu.forEach((b) => {
  if (b.dataset.seccion) b.addEventListener("click", () => mostrarSeccion(b.dataset.seccion));
});

// ---------- Datos (Google Sheets mediante Apps Script) ----------
// Columnas de la hoja: A Fecha | B Actividades | C Descripcion | D Anotaciones
const CAMPOS = [
  { clave: "actividades", etiqueta: "Actividades" },
  { clave: "descripcion", etiqueta: "Descripción" },
  { clave: "anotaciones", etiqueta: "Anotaciones" },
];

const datos = {}; // { "2026-10-13": { actividades, descripcion, anotaciones } }
const estadoCal = document.getElementById("cal-estado");

function configurado() {
  return typeof CONFIG !== "undefined" && CONFIG.APPS_SCRIPT_URL && CONFIG.TOKEN;
}

function mostrarEstadoCal(texto, tipo) {
  estadoCal.textContent = texto;
  estadoCal.className = "cal-estado" + (tipo ? " " + tipo : "");
  estadoCal.hidden = !texto;
}

let calendarioCargado = false; // ya se leyeron los datos del calendario con la sesión actual

// Quita los datos del calendario de la pantalla (sin sesión nadie los ve)
function vaciarCalendario(aviso) {
  Object.keys(datos).forEach((k) => delete datos[k]);
  calendarioCargado = false;
  cerrarPopover();
  dibujarCalendario();
  mostrarEstadoCal(aviso || "");
}

// Leer el calendario también exige iniciar sesión con la cuenta autorizada
async function cargarDatos() {
  if (!configurado()) {
    mostrarEstadoCal(
      "Falta conectar Google Sheets: revisa config.js y el README.",
      "error"
    );
    return;
  }
  const idToken = credencialVigente();
  if (!idToken) {
    vaciarCalendario("Inicia sesión con Google (menú ☰) para ver tu calendario.");
    return;
  }
  mostrarEstadoCal("Cargando datos…");
  try {
    // text/plain evita el "preflight" de CORS con Apps Script
    const r = await fetch(CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ token: CONFIG.TOKEN, idToken, accion: "calendario_listar" }),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Error desconocido");
    Object.keys(datos).forEach((k) => delete datos[k]);
    Object.assign(datos, j.datos);
    calendarioCargado = true;
    mostrarEstadoCal("");
    dibujarCalendario();
  } catch (e) {
    mostrarEstadoCal("No se pudieron cargar los datos: " + e.message, "error");
  }
}

// Se llama cuando cambia la sesión: al entrar se leen los datos y al salir se quitan de pantalla
function actualizarCalendarioSesion() {
  if (sesionVigente()) {
    if (!calendarioCargado) cargarDatos();
  } else {
    vaciarCalendario("Inicia sesión con Google (menú ☰) para ver tu calendario.");
  }
}

async function guardarCampo(fecha, campo, valor) {
  if (!configurado()) throw new Error("Falta configurar config.js");
  // Para modificar la hoja hace falta haber iniciado sesión con Google
  const idToken = credencialVigente();
  if (!idToken) {
    abrirLateral();
    throw new Error("Inicia sesión con Google para guardar");
  }
  // text/plain evita el "preflight" de CORS con Apps Script
  const r = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: CONFIG.TOKEN, idToken, fecha, campo, valor }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Error al guardar");
  datos[fecha] = datos[fecha] || {};
  datos[fecha][campo] = valor;
}

function tieneDatos(fecha) {
  const d = datos[fecha];
  return !!d && CAMPOS.some((c) => (d[c.clave] || "").trim() !== "");
}

// ---------- Varios elementos en una sola celda, entre paréntesis ----------
// Descripción, Actividades y Anotaciones funcionan igual. Ejemplo en la hoja:
//   (primer elemento) (segundo elemento) (tercer elemento)

function parentesisBalanceados(s) {
  let n = 0;
  for (const ch of s) {
    if (ch === "(") n++;
    else if (ch === ")") {
      n--;
      if (n < 0) return false;
    }
  }
  return n === 0;
}

// Si el texto trae paréntesis sueltos, se cambian por corchetes para no romper el formato
function limpiarElemento(s) {
  s = s.trim();
  return parentesisBalanceados(s) ? s : s.replace(/\(/g, "[").replace(/\)/g, "]");
}

// Convierte el contenido de una celda en una lista de elementos.
// Si la celda tiene texto antiguo sin el formato de paréntesis, se muestra como un solo elemento.
function parsearElementos(texto) {
  const t = (texto || "").trim();
  if (!t) return [];
  const elementos = [];
  let profundidad = 0;
  let actual = "";
  for (const ch of t) {
    if (profundidad === 0) {
      if (ch === "(") {
        profundidad = 1;
        actual = "";
      } else if (/\s/.test(ch)) {
        continue;
      } else {
        return [t]; // hay texto fuera de los paréntesis: es contenido antiguo
      }
    } else if (ch === "(") {
      profundidad++;
      actual += ch;
    } else if (ch === ")") {
      profundidad--;
      if (profundidad === 0) elementos.push(actual.trim());
      else actual += ch;
    } else {
      actual += ch;
    }
  }
  if (profundidad !== 0) return [t]; // paréntesis sin cerrar: contenido antiguo
  return elementos.filter((e) => e !== "");
}

function serializarElementos(elementos) {
  return elementos.map((e) => "(" + limpiarElemento(e) + ")").join(" ");
}

// ---------- Calendario (1930 - 2100) ----------
const ANIO_MIN = 1930;
const ANIO_MAX = 2100;
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]; // semana inicia en lunes

const selMes = document.getElementById("cal-mes");
const selAnio = document.getElementById("cal-anio");
const btnAnterior = document.getElementById("cal-anterior");
const btnSiguiente = document.getElementById("cal-siguiente");
const btnHoy = document.getElementById("cal-hoy");
const btnActualizar = document.getElementById("cal-actualizar");
const cuadricula = document.getElementById("cal-cuadricula");

let hoy = new Date();
let mesActual = hoy.getMonth();
let anioActual = hoy.getFullYear();
let seleccion = null; // fecha seleccionada "YYYY-MM-DD"

const dos = (n) => String(n).padStart(2, "0");
const claveFecha = (a, m, d) => `${a}-${dos(m + 1)}-${dos(d)}`;

MESES.forEach((nombre, i) => selMes.add(new Option(nombre, i)));
for (let a = ANIO_MIN; a <= ANIO_MAX; a++) selAnio.add(new Option(a, a));

// Color de un día (vacío = sin color): un pastel con nombre o un código #rrggbb
function colorDeDia(fecha) {
  const c = String((datos[fecha] || {}).color || "").trim();
  return c ? hexDeColor(c) : "";
}

function dibujarCalendario() {
  selMes.value = mesActual;
  selAnio.value = anioActual;
  btnAnterior.disabled = anioActual === ANIO_MIN && mesActual === 0;
  btnSiguiente.disabled = anioActual === ANIO_MAX && mesActual === 11;

  cuadricula.innerHTML = "";

  DIAS.forEach((d) => {
    const el = document.createElement("div");
    el.className = "cal-dia-semana";
    el.textContent = d;
    cuadricula.appendChild(el);
  });

  // getDay(): 0=domingo ... 6=sábado. Convertimos a lunes=0.
  const primerDia = (new Date(anioActual, mesActual, 1).getDay() + 6) % 7;
  const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate();

  for (let i = 0; i < primerDia; i++) {
    const vacio = document.createElement("div");
    vacio.className = "cal-dia vacio";
    cuadricula.appendChild(vacio);
  }

  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = claveFecha(anioActual, mesActual, d);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cal-dia";
    el.textContent = d;
    el.dataset.fecha = fecha;

    const diaSemana = (primerDia + d - 1) % 7;
    if (diaSemana >= 5) el.classList.add("finde");

    if (d === hoy.getDate() && mesActual === hoy.getMonth() && anioActual === hoy.getFullYear()) {
      el.classList.add("hoy");
    }
    if (fecha === seleccion) el.classList.add("seleccionado");
    if (tieneDatos(fecha)) el.classList.add("con-datos");
    const colorDia = colorDeDia(fecha);
    if (colorDia) {
      el.classList.add("con-color");
      el.style.background = colorDia;
      el.style.color = esColorOscuro(colorDia) ? "#fff" : "#2b2140";
    }

    el.addEventListener("click", () => abrirDia(fecha));
    cuadricula.appendChild(el);
  }
}

function cambiarMes(delta) {
  cerrarPopover();
  mesActual += delta;
  if (mesActual < 0) { mesActual = 11; anioActual--; }
  if (mesActual > 11) { mesActual = 0; anioActual++; }
  if (anioActual < ANIO_MIN) { anioActual = ANIO_MIN; mesActual = 0; }
  if (anioActual > ANIO_MAX) { anioActual = ANIO_MAX; mesActual = 11; }
  dibujarCalendario();
}

btnAnterior.addEventListener("click", () => cambiarMes(-1));
btnSiguiente.addEventListener("click", () => cambiarMes(1));
selMes.addEventListener("change", () => {
  cerrarPopover();
  mesActual = Number(selMes.value);
  dibujarCalendario();
});
selAnio.addEventListener("change", () => {
  cerrarPopover();
  anioActual = Number(selAnio.value);
  dibujarCalendario();
});
// Vuelve al mes y año de hoy (vuelve a leer la fecha por si la página lleva días abierta)
function irAHoy() {
  hoy = new Date();
  mesActual = hoy.getMonth();
  anioActual = hoy.getFullYear();
  cerrarPopover();
  dibujarCalendario();
}

btnHoy.addEventListener("click", irAHoy);
btnActualizar.addEventListener("click", () => {
  cerrarPopover();
  cargarDatos();
});

// ---------- Panel del día ----------
const seccionCal = document.getElementById("calendario");
const popover = document.getElementById("dia-popover");
const popTitulo = document.getElementById("pop-titulo");
const popCerrar = document.getElementById("pop-cerrar");

// Textos de cada sección (el orden en pantalla lo define index.html)
const TEXTOS = {
  descripcion: {
    vacio: "Aún no hay descripción para este día.",
    confirmar: "¿Eliminar esta descripción?",
  },
  actividades: {
    vacio: "Aún no hay actividades para este día.",
    confirmar: "¿Eliminar esta actividad?",
  },
  anotaciones: {
    vacio: "Aún no hay anotaciones para este día.",
    confirmar: "¿Eliminar esta anotación?",
  },
};

function setEstado(el, texto, tipo) {
  el.textContent = texto;
  el.classList.remove("ok", "error");
  if (tipo) el.classList.add(tipo);
}

function actualizarMarca(fecha) {
  const celda = cuadricula.querySelector(`[data-fecha="${fecha}"]`);
  if (celda) celda.classList.toggle("con-datos", tieneDatos(fecha));
}

// Cada sección: botón del título (abre la zona de texto) + botón "Desplegar" (abre los recuadros)
const bloquesDia = Array.from(
  document.querySelectorAll("#pop-secciones .pop-seccion[data-campo]")
).map((el) => ({
  campo: el.dataset.campo,
  btnTexto: el.querySelector('[data-accion="texto"]'),
  panelTexto: el.querySelector(".pop-panel-texto"),
  txt: el.querySelector("textarea"),
  btnGuardar: el.querySelector(".btn-guardar"),
  btnCancelar: el.querySelector(".btn-cancelar"),
  textoGuardar: el.querySelector(".btn-guardar").textContent,
  unico: el.dataset.campo === "descripcion", // la descripción es una sola por día
  editando: null, // posición del texto que se está modificando (null = texto nuevo)
  est: el.querySelector(".pop-panel-texto .pop-estado"),
  btnLista: el.querySelector('[data-accion="lista"]'),
  panelLista: el.querySelector(".pop-panel-lista"),
  fija: el.querySelector(".lista-fija"),
  lista: el.querySelector(".lista-extra"),
  etiquetaLista: el.querySelector(".pop-lista-etiqueta"),
  estLista: el.querySelector(".pop-estado-lista"),
}));

function plegar(boton, panel) {
  panel.hidden = true;
  boton.setAttribute("aria-expanded", "false");
}

// Muestra u oculta un panel. Sin "abrir", cambia al estado contrario.
function alternar(boton, panel, abrir) {
  const mostrar = abrir === undefined ? panel.hidden : abrir;
  panel.hidden = !mostrar;
  boton.setAttribute("aria-expanded", String(mostrar));
  if (mostrar) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function elementosDe(fecha, campo) {
  return parsearElementos((datos[fecha] || {})[campo]);
}

const MAX_VISIBLES = 4; // los primeros 4 recuadros siempre se ven

function crearNota(texto, indice, b, completa) {
  const caja = document.createElement("div");
  caja.className = "nota" + (completa ? " nota-completa" : "");
  const t = document.createElement("p");
  t.className = "nota-texto";
  t.textContent = texto;
  const e = document.createElement("button");
  e.type = "button";
  e.className = "nota-editar";
  e.title = "Modificar";
  e.setAttribute("aria-label", "Modificar");
  e.textContent = "✎";
  e.addEventListener("click", () => abrirEditor(b, indice));
  const x = document.createElement("button");
  x.type = "button";
  x.className = "nota-borrar";
  x.setAttribute("aria-label", "Eliminar");
  x.textContent = "×";
  x.addEventListener("click", () => borrarElemento(b, indice));
  caja.append(t, e, x);

  // Tocar el recuadro en cualquier zona lo abre para modificarlo (✎ y × siguen con su función)
  caja.tabIndex = 0;
  caja.setAttribute("role", "button");
  caja.setAttribute("aria-label", "Modificar este texto");
  caja.addEventListener("click", (ev) => {
    if (ev.target.closest("button")) return;
    if (String(window.getSelection()).length) return; // si estaba seleccionando texto, no se abre
    abrirEditor(b, indice);
  });
  caja.addEventListener("keydown", (ev) => {
    if (ev.target === caja && (ev.key === "Enter" || ev.key === " ")) {
      ev.preventDefault();
      abrirEditor(b, indice);
    }
  });
  return caja;
}

function dibujarLista(fecha, b) {
  b.fija.innerHTML = "";
  b.lista.innerHTML = "";
  const elementos = elementosDe(fecha, b.campo);

  if (!elementos.length) {
    const p = document.createElement("p");
    p.className = "sin-notas";
    p.textContent = TEXTOS[b.campo].vacio;
    b.fija.appendChild(p);
  }

  // La descripción es una sola: se muestra como un solo texto a lo largo del panel
  // (si en la hoja había varias, se unen aquí en un solo texto)
  if (b.unico) {
    if (elementos.length) b.fija.appendChild(crearNota(elementos.join("\n\n"), 0, b, true));
    b.btnLista.hidden = true;
    plegar(b.btnLista, b.panelLista);
    return;
  }

  elementos.forEach((texto, i) => {
    const caja = crearNota(texto, i, b);
    (i < MAX_VISIBLES ? b.fija : b.lista).appendChild(caja);
  });

  // El botón "Desplegar" solo aparece si hay más de 4 recuadros
  const extras = Math.max(0, elementos.length - MAX_VISIBLES);
  b.btnLista.hidden = extras === 0;
  b.etiquetaLista.textContent = extras ? `Desplegar (${extras} más)` : "Desplegar";
  if (extras === 0) plegar(b.btnLista, b.panelLista);
}

// Fecha y hora del momento de guardar, con el formato: 14/10/2026 21:35
function selloFechaHora() {
  const n = new Date();
  return `${dos(n.getDate())}/${dos(n.getMonth() + 1)}/${n.getFullYear()} ` +
    `${dos(n.getHours())}:${dos(n.getMinutes())}`;
}

// Texto que se carga en la zona de escritura: vacío (texto nuevo) o el texto guardado
// (la descripción, al ser una sola, se carga completa)
function textoEditable(fecha, b, indice) {
  if (indice === null) return "";
  const elementos = elementosDe(fecha, b.campo);
  return b.unico ? elementos.join("\n\n") : elementos[indice] || "";
}

// Deja la zona de escritura en modo «texto nuevo»
function reiniciarEditor(b) {
  b.editando = null;
  b.txt.value = "";
  b.btnGuardar.textContent = b.textoGuardar;
  b.btnCancelar.hidden = true;
}

// Abre la zona de escritura: para un texto nuevo (indice = null) o para modificar uno guardado.
// La descripción es una sola: si ya existe, siempre se abre para modificarla.
function abrirEditor(b, indice) {
  const fecha = seleccion;
  if (!fecha) return;
  if (b.unico && elementosDe(fecha, b.campo).length) indice = 0;

  if (indice === null) {
    // Texto nuevo: se conserva lo que ya se hubiera escrito
    if (b.editando !== null) reiniciarEditor(b);
    alternar(b.btnTexto, b.panelTexto, true);
    b.txt.focus();
    return;
  }
  if (b.editando === indice && !b.panelTexto.hidden) {
    b.txt.focus();
    return;
  }
  const original = b.editando === null ? "" : textoEditable(fecha, b, b.editando);
  if (b.txt.value.trim() && b.txt.value !== original &&
      !window.confirm("Tienes texto sin guardar en esta sección. ¿Descartarlo?")) return;

  b.editando = indice;
  b.txt.value = textoEditable(fecha, b, indice);
  b.btnGuardar.textContent = "Guardar cambios";
  b.btnCancelar.hidden = false;
  setEstado(b.est, "");
  alternar(b.btnTexto, b.panelTexto, true);
  b.txt.focus();
}

// Guarda un texto nuevo o los cambios de uno que se estaba modificando
async function guardarElemento(b) {
  const fecha = seleccion;
  const texto = b.txt.value.trim();
  if (!fecha) return;
  if (!texto) {
    setEstado(b.est, "Escribe algo primero", "error");
    return;
  }
  const editando = b.editando;
  let elementos = elementosDe(fecha, b.campo);
  if (editando !== null && b.unico) {
    elementos = [limpiarElemento(texto)]; // la descripción es una sola
  } else if (editando !== null) {
    if (editando >= elementos.length) {
      setEstado(b.est, "Ese texto ya no existe. Cierra y vuelve a abrir el día.", "error");
      return;
    }
    elementos[editando] = limpiarElemento(texto);
  } else if (b.unico && elementos.length) {
    setEstado(b.est, "Ya hay una descripción: modifícala con el lápiz ✎.", "error");
    return;
  } else {
    // La fecha y hora van al inicio del recuadro, en su propia línea, antes del texto
    const conSello = selloFechaHora() + "\n" + texto;
    elementos = elementos.concat(limpiarElemento(conSello));
  }
  b.btnGuardar.disabled = true;
  setEstado(b.est, "Guardando…");
  try {
    await guardarCampo(fecha, b.campo, serializarElementos(elementos));
    if (seleccion === fecha) {
      dibujarLista(fecha, b);
      if (editando !== null || b.unico) {
        // Al terminar de modificar (o de escribir la descripción) se cierra la zona de texto
        reiniciarEditor(b);
        plegar(b.btnTexto, b.panelTexto);
        setEstado(b.est, "");
        setEstado(b.estLista, editando !== null ? "Cambios guardados ✓" : "Guardada ✓", "ok");
      } else {
        b.txt.value = "";
        // Si el recuadro nuevo quedó después del 4.º, abre la lista para que se vea
        if (elementos.length > MAX_VISIBLES) alternar(b.btnLista, b.panelLista, true);
        setEstado(b.est, "Guardado ✓", "ok");
      }
    }
    actualizarMarca(fecha);
  } catch (e) {
    setEstado(b.est, "Error: " + e.message, "error");
  } finally {
    b.btnGuardar.disabled = false;
  }
}

async function borrarElemento(b, indice) {
  const fecha = seleccion;
  if (!fecha) return;
  if (!window.confirm(TEXTOS[b.campo].confirmar)) return;
  const elementos = b.unico ? [] : elementosDe(fecha, b.campo); // la descripción se borra completa
  if (!b.unico) elementos.splice(indice, 1);
  setEstado(b.estLista, "Guardando…");
  try {
    await guardarCampo(fecha, b.campo, serializarElementos(elementos));
    if (seleccion === fecha) {
      if (b.editando !== null) {
        reiniciarEditor(b);
        plegar(b.btnTexto, b.panelTexto);
      }
      dibujarLista(fecha, b);
      setEstado(b.estLista, "Eliminado", "ok");
    }
    actualizarMarca(fecha);
  } catch (e) {
    setEstado(b.estLista, "Error: " + e.message, "error");
  }
}

bloquesDia.forEach((b) => {
  b.btnTexto.addEventListener("click", () => {
    if (!b.panelTexto.hidden) {
      // Se cierra la zona de texto (si se estaba modificando algo, se deja sin cambios)
      if (b.editando !== null) reiniciarEditor(b);
      plegar(b.btnTexto, b.panelTexto);
      return;
    }
    abrirEditor(b, null);
  });
  b.btnLista.addEventListener("click", () => alternar(b.btnLista, b.panelLista));
  b.btnGuardar.addEventListener("click", () => guardarElemento(b));
  b.btnCancelar.addEventListener("click", () => {
    reiniciarEditor(b);
    plegar(b.btnTexto, b.panelTexto);
    setEstado(b.est, "");
  });
});

function textoFecha(fecha) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

function posicionarPopover(celda) {
  const rs = seccionCal.getBoundingClientRect();
  const rc = celda.getBoundingClientRect();
  const ancho = popover.offsetWidth;
  const centro = rc.left - rs.left + rc.width / 2;
  // Centrado en el día, pero sin salirse de la pantalla (el panel puede ser más ancho que la sección)
  const minIzq = 12 - rs.left;
  const maxIzq = document.documentElement.clientWidth - 12 - rs.left - ancho;
  const izq = Math.max(minIzq, Math.min(centro - ancho / 2, maxIzq));
  popover.style.left = izq + "px";
  popover.style.top = rc.bottom - rs.top + 10 + "px";
  const flecha = Math.max(24, Math.min(centro - izq, Math.max(ancho - 24, 24)));
  popover.style.setProperty("--flecha", flecha + "px");
}

function abrirDia(fecha) {
  seleccion = fecha;
  dibujarCalendario();

  popTitulo.textContent = textoFecha(fecha);
  // Al abrir un día se ven los 3 títulos y sus primeros 4 recuadros; lo demás empieza plegado
  bloquesDia.forEach((b) => {
    b.txt.value = "";
    reiniciarEditor(b);
    setEstado(b.est, "");
    setEstado(b.estLista, "");
    plegar(b.btnTexto, b.panelTexto);
    plegar(b.btnLista, b.panelLista);
    dibujarLista(fecha, b);
  });

  pintarPanelDia((datos[fecha] || {}).color);
  setEstado(popColorEstado, "");
  plegarPaletaDia();

  popover.hidden = false;
  posicionarPopover(cuadricula.querySelector(`[data-fecha="${fecha}"]`));
  popover.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cerrarPopover() {
  if (popover.hidden && !seleccion) return;
  popover.hidden = true;
  seleccion = null;
  cuadricula
    .querySelectorAll(".seleccionado")
    .forEach((e) => e.classList.remove("seleccionado"));
}

popCerrar.addEventListener("click", cerrarPopover);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarPopover();
});
document.addEventListener("click", (e) => {
  if (popover.hidden) return;
  const ruta = e.composedPath();
  if (ruta.includes(popover)) return;
  if (ruta.some((n) => n.classList && n.classList.contains("cal-dia"))) return;
  cerrarPopover();
});
window.addEventListener("resize", () => {
  if (!popover.hidden && seleccion) {
    const celda = cuadricula.querySelector(`[data-fecha="${seleccion}"]`);
    if (celda) posicionarPopover(celda);
  }
});

// ---------- Barra lateral e inicio de sesión con Google ----------
const btnLateral = document.getElementById("btn-menu-lateral");
const barraLateral = document.getElementById("barra-lateral");
const fondoLateral = document.getElementById("fondo-lateral");
const btnCerrarLateral = document.getElementById("lateral-cerrar");

function abrirLateral() {
  barraLateral.classList.add("abierta");
  barraLateral.setAttribute("aria-hidden", "false");
  fondoLateral.hidden = false;
  btnLateral.setAttribute("aria-expanded", "true");
}

function cerrarLateral() {
  barraLateral.classList.remove("abierta");
  barraLateral.setAttribute("aria-hidden", "true");
  fondoLateral.hidden = true;
  btnLateral.setAttribute("aria-expanded", "false");
}

btnLateral.addEventListener("click", () =>
  barraLateral.classList.contains("abierta") ? cerrarLateral() : abrirLateral()
);
btnCerrarLateral.addEventListener("click", cerrarLateral);
fondoLateral.addEventListener("click", cerrarLateral);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") cerrarLateral();
});

const CLAVE_SESION = "polo-ai-sesion";
const cuentaSin = document.getElementById("cuenta-sin-sesion");
const cuentaCon = document.getElementById("cuenta-con-sesion");
const googleBoton = document.getElementById("google-boton");
const googleAviso = document.getElementById("google-aviso");
const cuentaFoto = document.getElementById("cuenta-foto");
const cuentaNombre = document.getElementById("cuenta-nombre");
const cuentaCorreo = document.getElementById("cuenta-correo");
const btnSalir = document.getElementById("cuenta-salir");

let usuario = null; // { nombre, correo, foto, credencial, exp }
try {
  usuario = JSON.parse(localStorage.getItem(CLAVE_SESION));
} catch (e) {
  usuario = null;
}

// La credencial de Google dura cerca de 1 hora. Pasado ese tiempo hay que volver a entrar
// (si ya habías aceptado antes, Google suele volver a iniciar sesión solo).
function sesionVigente() {
  return !!(usuario && usuario.credencial && usuario.exp * 1000 > Date.now() + 15000);
}

function credencialVigente() {
  return sesionVigente() ? usuario.credencial : null;
}

let sesionCaducada = false; // había una sesión guardada pero ya venció
if (usuario && !sesionVigente()) {
  usuario = null;
  sesionCaducada = true;
  try {
    localStorage.removeItem(CLAVE_SESION);
  } catch (e) {}
}

let temporizadorSesion = null;
function programarCaducidad() {
  clearTimeout(temporizadorSesion);
  if (!usuario) return;
  const ms = Math.max(usuario.exp * 1000 - Date.now() - 15000, 0);
  temporizadorSesion = setTimeout(expirarSesion, ms);
}

// Vence la credencial: se cierra la sesión en pantalla y se intenta volver a entrar sola
function expirarSesion() {
  usuario = null;
  try {
    localStorage.removeItem(CLAVE_SESION);
  } catch (e) {}
  dibujarCuenta();
  actualizarPanelNotas();
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.prompt();
}

// El token de Google (JWT) trae los datos de la cuenta en su parte central, en base64
function decodificarJWT(token) {
  const base = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(base)
      .split("")
      .map((ch) => "%" + ("00" + ch.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
  return JSON.parse(json);
}

function dibujarCuenta() {
  cuentaSin.hidden = !!usuario;
  cuentaCon.hidden = !usuario;
  if (!usuario) return;
  cuentaNombre.textContent = usuario.nombre || "";
  cuentaCorreo.textContent = usuario.correo || "";
  const fotoValida = typeof usuario.foto === "string" && usuario.foto.startsWith("https://");
  cuentaFoto.hidden = !fotoValida;
  if (fotoValida) cuentaFoto.src = usuario.foto;
}

function respuestaGoogle(resp) {
  try {
    const p = decodificarJWT(resp.credential);
    usuario = {
      nombre: p.name || "",
      correo: p.email || "",
      foto: p.picture || "",
      credencial: resp.credential,
      exp: p.exp,
    };
    try {
      localStorage.setItem(CLAVE_SESION, JSON.stringify(usuario));
    } catch (e) {}
    googleAviso.hidden = true;
    dibujarCuenta();
    programarCaducidad();
    actualizarPanelNotas();
  } catch (e) {
    googleAviso.textContent = "No se pudo iniciar sesión: " + e.message;
    googleAviso.hidden = false;
  }
}

function cerrarSesion() {
  clearTimeout(temporizadorSesion);
  usuario = null;
  try {
    localStorage.removeItem(CLAVE_SESION);
  } catch (e) {}
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  dibujarCuenta();
  actualizarPanelNotas();
}
btnSalir.addEventListener("click", cerrarSesion);

function iniciarGoogle() {
  if (typeof CONFIG === "undefined" || !CONFIG.GOOGLE_CLIENT_ID) {
    googleAviso.textContent =
      "Falta configurar GOOGLE_CLIENT_ID en config.js (revisa el README).";
    googleAviso.hidden = false;
    return;
  }
  const s = document.createElement("script");
  s.src = "https://accounts.google.com/gsi/client";
  s.async = true;
  s.defer = true;
  s.onload = () => {
    google.accounts.id.initialize({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      callback: respuestaGoogle,
      auto_select: true,
    });
    google.accounts.id.renderButton(googleBoton, {
      theme: "filled_black",
      size: "large",
      text: "signin_with",
      locale: "es",
    });
    // Si había una sesión que ya venció, intenta entrar de nuevo sin pedirte nada
    if (sesionCaducada) google.accounts.id.prompt();
  };
  s.onerror = () => {
    googleAviso.textContent = "No se pudo cargar el servicio de Google. Revisa tu conexión.";
    googleAviso.hidden = false;
  };
  document.head.appendChild(s);
}

// ---------- Notas (hoja «Notas» de Google Sheets) ----------
const btnNotas = document.getElementById("btn-notas");
const panelNotas = document.getElementById("panel-notas");
const notasSinSesion = document.getElementById("notas-sin-sesion");
const notasContenido = document.getElementById("notas-contenido");
const notasTexto = document.getElementById("notas-texto");
const notasForm = document.getElementById("notas-form");
const notasNombre = document.getElementById("notas-nombre");
const notasEtiqueta = document.getElementById("notas-etiqueta");
const notasColores = document.getElementById("notas-colores");
const notasGuardar = document.getElementById("notas-guardar");
const notasEstado = document.getElementById("notas-estado");
const notasEstadoLista = document.getElementById("notas-estado-lista");
const notasNuevaBtn = document.getElementById("notas-nueva-btn");
const notasCancelar = document.getElementById("notas-cancelar");
const notasFecha = document.getElementById("notas-fecha");
const notasSubmenu = document.getElementById("notas-submenu");
const notasSubTitulo = document.getElementById("notas-sub-titulo");
const notasSubLista = document.getElementById("notas-sub-lista");
const notasSubVolver = document.getElementById("notas-sub-volver");
const notasMasColores = document.getElementById("notas-mas-colores");
const notasPaleta = document.getElementById("notas-paleta");
const notasPaletaFamilias = document.getElementById("notas-paleta-familias");
const notasColorPersonal = document.getElementById("notas-color-personal");
const notasPersonal = document.getElementById("notas-personal");
const notasLista = document.getElementById("notas-lista");
const notasIdent = document.getElementById("notas-identificador");
const notasFormTitulo = document.getElementById("notas-form-titulo");
const notasCaja = document.querySelector("#panel-notas .notas-caja");

let notaEditando = null; // nota que se está editando en el formulario (null = nota nueva)

let notas = []; // [{ id, nombre, fecha, etiqueta, texto, color, identificador }]
let notasCargadas = false;
let etiquetaAbierta = null; // etiqueta cuyo submenú está abierto (null = ninguno)
let etiquetaPendiente = null; // etiqueta a abrir en cuanto terminen de cargar las notas (acceso directo)
const MAX_FILA_NOTAS = 4; // notas visibles por fila; el resto va en el submenú

// Etiquetas y colores (los nombres se guardan tal cual en la hoja; deben coincidir con el Apps Script)
const ETIQUETAS_NOTA = [
  "General",
  "Tarea/Actividad",
  "Conjunto de Datos",
  "Sueños",
  "Pendiente Importante",
  "Pedidos de Yeso",
  "Actividades",
  "Trabajo",
];
const COLORES_NOTA = [
  { nombre: "Blanco", hex: "#ffffff" },
  { nombre: "Azul", hex: "#c4e1fb" },
  { nombre: "Rosa", hex: "#fbd3e3" },
  { nombre: "Menta", hex: "#cdf1de" },
  { nombre: "Lila", hex: "#e3d7f8" },
  { nombre: "Durazno", hex: "#fddcc6" },
  { nombre: "Amarillo", hex: "#fff4bd" },
  { nombre: "Turquesa", hex: "#c8f0f0" },
];
let colorElegido = "Blanco";

// Más colores (además de los pasteles de arriba): familias de claro a oscuro.
// Estos se guardan en la hoja como código "#rrggbb"; los pasteles, por su nombre.
const PALETA_COLORES = [
  { titulo: "Más pasteles", colores: ["#e6e6fa", "#ffd6cc", "#e6f7b8", "#d6ecff", "#f3d1f4", "#f5e6cc"] },
  { titulo: "Rojos", colores: ["#fecaca", "#fca5a5", "#f87171", "#ef4444", "#dc2626", "#991b1b"] },
  { titulo: "Naranjas", colores: ["#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c", "#9a3412"] },
  { titulo: "Amarillos", colores: ["#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04", "#854d0e"] },
  { titulo: "Verdes", colores: ["#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a", "#166534"] },
  { titulo: "Turquesas", colores: ["#a5f3fc", "#67e8f9", "#22d3ee", "#06b6d4", "#0891b2", "#155e75"] },
  { titulo: "Azules", colores: ["#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1e40af"] },
  { titulo: "Morados", colores: ["#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#7c3aed", "#5b21b6"] },
  { titulo: "Rosas", colores: ["#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777", "#9d174d"] },
  { titulo: "Cafés", colores: ["#e7cfb4", "#d2a679", "#b07a4a", "#8b5a2b", "#6b4423", "#3f2a14"] },
  { titulo: "Grises", colores: ["#f1f5f9", "#cbd5e1", "#94a3b8", "#64748b", "#334155", "#111827"] },
];

// Acepta el nombre de un pastel ("Rosa") o un código "#rrggbb"
function hexDeColor(valor) {
  const v = String(valor || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  const c = COLORES_NOTA.find((x) => x.nombre === v);
  return c ? c.hex : "#ffffff";
}

// Si el color es oscuro, el texto pasa a blanco para que se pueda leer
function esColorOscuro(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
}
function aplicarContraste(el, hex) {
  if (esColorOscuro(hex)) {
    el.style.setProperty("color", "#fff");
    el.style.setProperty("--nb-suave", "rgba(255, 255, 255, 0.8)");
  } else {
    el.style.removeProperty("color");
    el.style.removeProperty("--nb-suave");
  }
}

// El color elegido se ve de fondo en el formulario mientras escribes la nota
function elegirColor(valor) {
  colorElegido = valor;
  const hex = hexDeColor(valor);
  notasForm.style.setProperty("--fondo-nota", hex);
  aplicarContraste(notasForm, hex);
  let enMuestra = false;
  notasForm.querySelectorAll(".color-op").forEach((b) => {
    const activo = b.dataset.color.toLowerCase() === String(valor).toLowerCase();
    if (activo) enMuestra = true;
    b.classList.toggle("elegido", activo);
    b.setAttribute("aria-checked", activo ? "true" : "false");
  });
  notasColorPersonal.value = hex;
  notasPersonal.classList.toggle("elegido", !enMuestra);
}

function crearMuestraColor(valor, hex, titulo) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "color-op";
  b.dataset.color = valor;
  b.title = titulo;
  b.setAttribute("role", "radio");
  b.setAttribute("aria-label", titulo);
  b.style.background = hex;
  b.addEventListener("click", () => elegirColor(valor));
  return b;
}

ETIQUETAS_NOTA.forEach((e) => {
  const op = document.createElement("option");
  op.value = e;
  op.textContent = e;
  notasEtiqueta.appendChild(op);
});
COLORES_NOTA.forEach((c) => notasColores.appendChild(crearMuestraColor(c.nombre, c.hex, c.nombre)));
PALETA_COLORES.forEach((f) => {
  const fila = document.createElement("div");
  fila.className = "paleta-fila";
  const nombre = document.createElement("span");
  nombre.className = "paleta-nombre";
  nombre.textContent = f.titulo;
  const cont = document.createElement("div");
  cont.className = "notas-colores";
  cont.setAttribute("role", "radiogroup");
  cont.setAttribute("aria-label", f.titulo);
  f.colores.forEach((hex) => cont.appendChild(crearMuestraColor(hex, hex, f.titulo + " " + hex)));
  fila.append(nombre, cont);
  notasPaletaFamilias.appendChild(fila);
});
// Selector libre: cualquier color del espectro
notasColorPersonal.addEventListener("input", () => elegirColor(notasColorPersonal.value.toLowerCase()));
notasMasColores.addEventListener("click", () => {
  const abrir = notasPaleta.hidden;
  notasPaleta.hidden = !abrir;
  notasMasColores.setAttribute("aria-expanded", abrir ? "true" : "false");
  notasMasColores.textContent = abrir ? "Menos colores ▴" : "Más colores ▾";
});
elegirColor("Blanco");

// Llama al Apps Script para las notas (siempre con la sesión de Google)
async function llamarNotas(accion, extra) {
  if (!configurado()) throw new Error("Falta configurar config.js");
  const idToken = credencialVigente();
  if (!idToken) throw new Error("Inicia sesión con Google");
  // text/plain evita el "preflight" de CORS con Apps Script
  const r = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ token: CONFIG.TOKEN, idToken, accion }, extra || {})),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Error");
  return j;
}

// ----- Fechas de las notas: se guardan como "dd/mm/aaaa hh:mm" -----
// "dd/mm/aaaa hh:mm" -> "aaaa-mm-ddThh:mm" (formato del campo de fecha y hora); "" si no se entiende
function fechaAInput(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})/.exec(String(s || "").trim());
  if (!m) return "";
  return `${m[3]}-${dos(m[2])}-${dos(m[1])}T${dos(m[4])}:${m[5]}`;
}
// "aaaa-mm-ddThh:mm" -> "dd/mm/aaaa hh:mm"; "" si el campo está vacío
function inputAFecha(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || "");
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}` : "";
}
function fechaActualInput() {
  const n = new Date();
  return `${n.getFullYear()}-${dos(n.getMonth() + 1)}-${dos(n.getDate())}` +
    `T${dos(n.getHours())}:${dos(n.getMinutes())}`;
}
function marcaTiempo(s) {
  const v = fechaAInput(s);
  return v ? Date.parse(v) : NaN;
}

// Muestra u oculta las opciones para crear una nota (el botón "Nueva nota" hace lo contrario)
function mostrarFormNota(mostrar) {
  salirModoEdicion();
  notasForm.hidden = !mostrar;
  notasNuevaBtn.hidden = mostrar;
  if (mostrar) {
    notasFecha.value = fechaActualInput();
    setEstado(notasEstado, "");
    notasNombre.focus();
    notasSnap = notasValores();
  }
}

// Vacía el formulario (deja los valores de una nota nueva)
function limpiarFormNota() {
  notasTexto.value = "";
  notasNombre.value = "";
  notasIdent.value = "";
  notasEtiqueta.selectedIndex = 0;
  elegirColor("Blanco");
  notasFecha.value = fechaActualInput();
}

// Vuelve el formulario a su lugar normal (arriba de la lista) y a modo "Nueva nota"
function salirModoEdicion() {
  if (!notaEditando) return;
  notaEditando = null;
  notasForm.classList.remove("modo-editar");
  notasContenido.insertBefore(notasForm, notasLista);
  notasFormTitulo.textContent = "Nueva nota";
  notasGuardar.textContent = "Guardar nota";
}

// Abre la edición de una nota: el mismo formulario, con sus datos, como ventana encima del panel
function abrirEdicionNota(n) {
  if (notaFormSucio() && !window.confirm("Tienes una nota sin guardar. ¿Descartarla para editar esta?")) return;

  salirModoEdicion();
  notaEditando = n;
  notasNombre.value = n.nombre === "Sin nombre" ? "" : n.nombre || "";
  notasEtiqueta.value = ETIQUETAS_NOTA.includes(n.etiqueta) ? n.etiqueta : "General";
  const c = String(n.color || "").trim();
  const colorValido = /^#[0-9a-fA-F]{6}$/.test(c) || COLORES_NOTA.some((x) => x.nombre === c);
  elegirColor(colorValido ? (c.startsWith("#") ? c.toLowerCase() : c) : "Blanco");
  notasFecha.value = fechaAInput(n.fecha) || fechaActualInput();
  notasIdent.value = n.identificador || "";
  notasTexto.value = n.texto || "";
  notasFormTitulo.textContent = "Editar nota";
  notasGuardar.textContent = "Guardar cambios";
  setEstado(notasEstado, "");

  notasForm.hidden = false;
  notasForm.classList.add("modo-editar");
  notasCaja.appendChild(notasForm); // al final de la caja: queda por encima de la lista y del submenú
  notasForm.scrollTop = 0;
  notasSnap = notasValores();
  notasNombre.focus();
}

// Cierra la edición sin guardar
function cancelarEdicionNota() {
  limpiarFormNota();
  mostrarFormNota(false);
}

// ----- Cambios sin guardar: se pregunta antes de abandonar la edición de una nota -----
const MENSAJE_ABANDONAR = "Tienes cambios sin guardar. ¿Seguro que quieres abandonar la edición actual?";
let notasSnap = ""; // valores del formulario de Notas al abrirlo (para saber si se cambió algo)

function notasValores() {
  return JSON.stringify([
    notasNombre.value, notasEtiqueta.value, colorElegido, notasFecha.value, notasIdent.value, notasTexto.value,
  ]);
}
// El formulario de Notas está abierto y se cambió algo desde que se abrió
function notaFormSucio() {
  return !notasForm.hidden && notasValores() !== notasSnap;
}
function confirmarAbandonoNota() {
  return !notaFormSucio() || window.confirm(MENSAJE_ABANDONAR);
}
function hayEdicionSinGuardar() {
  return notaFormSucio() || zonas.some((z) => z.sucio());
}
// Pregunta si hay algo sin guardar; si se acepta, el borrador se descarta
function confirmarAbandonoEdicion() {
  if (!hayEdicionSinGuardar()) return true;
  if (!window.confirm(MENSAJE_ABANDONAR)) return false;
  if (notaFormSucio()) {
    limpiarFormNota();
    mostrarFormNota(false);
  }
  zonas.forEach((z) => {
    if (z.sucio()) z.cancelar();
  });
  return true;
}
// Cerrar o recargar la página con una nota a medias también avisa
window.addEventListener("beforeunload", (e) => {
  if (hayEdicionSinGuardar()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// Fecha de una tarjeta: texto + lápiz para cambiarla
function dibujarFechaNota(cont, n) {
  cont.innerHTML = "";
  const txt = document.createElement("span");
  txt.textContent = n.fecha;
  const editar = document.createElement("button");
  editar.type = "button";
  editar.className = "tarjeta-editar-fecha";
  editar.title = "Cambiar fecha y hora";
  editar.setAttribute("aria-label", "Cambiar fecha y hora de la nota");
  editar.textContent = "✎";
  editar.addEventListener("click", () => editarFechaNota(cont, n));
  cont.append(txt, editar);
}

function editarFechaNota(cont, n) {
  cont.innerHTML = "";
  const inp = document.createElement("input");
  inp.type = "datetime-local";
  inp.className = "tarjeta-fecha-input";
  inp.value = fechaAInput(n.fecha) || fechaActualInput();
  const ok = document.createElement("button");
  ok.type = "button";
  ok.className = "tarjeta-fecha-ok";
  ok.textContent = "Guardar";
  const no = document.createElement("button");
  no.type = "button";
  no.className = "tarjeta-fecha-no";
  no.textContent = "Cancelar";
  ok.addEventListener("click", () => guardarFechaNota(n, inp.value, ok));
  no.addEventListener("click", () => dibujarFechaNota(cont, n));
  cont.append(inp, ok, no);
  inp.focus();
}

async function guardarFechaNota(n, valor, boton) {
  const fecha = inputAFecha(valor);
  if (!fecha) {
    setEstado(notasEstadoLista, "Elige una fecha y hora", "error");
    return;
  }
  boton.disabled = true;
  setEstado(notasEstadoLista, "Guardando fecha…");
  try {
    await llamarNotas("nota_fecha", { id: n.id, fecha });
    n.fecha = fecha;
    dibujarNotas();
    setEstado(notasEstadoLista, "Fecha actualizada ✓", "ok");
  } catch (e) {
    boton.disabled = false;
    setEstado(notasEstadoLista, "Error: " + e.message, "error");
  }
}

// Clave de orden del identificador: 0 = número, 1 = palabra, 2 = sin identificador
function claveIdent(s) {
  const v = String(s || "").trim();
  if (!v) return { tipo: 2 };
  if (/^-?\d+([.,]\d+)?$/.test(v)) return { tipo: 0, num: parseFloat(v.replace(",", ".")) };
  return { tipo: 1, txt: v };
}

// Orden de las notas: primero las que tienen identificador numérico (1, 2, 3…), luego las de
// palabra (A a Z) y al final las que no tienen. Con el mismo identificador (o sin él),
// la más reciente según su fecha va primero (si la fecha es igual, la última guardada).
function notasOrdenadas() {
  const orden = notas.map((n, i) => ({ n, i, t: marcaTiempo(n.fecha), k: claveIdent(n.identificador) }));
  orden.sort((x, y) => {
    if (x.k.tipo !== y.k.tipo) return x.k.tipo - y.k.tipo;
    if (x.k.tipo === 0 && x.k.num !== y.k.num) return x.k.num - y.k.num;
    if (x.k.tipo === 1) {
      const c = x.k.txt.localeCompare(y.k.txt, "es", { sensitivity: "base", numeric: true });
      if (c) return c;
    }
    const tx = isNaN(x.t) ? -Infinity : x.t;
    const ty = isNaN(y.t) ? -Infinity : y.t;
    return tx === ty ? y.i - x.i : ty - tx;
  });
  return orden.map((o) => o.n);
}

// Agrupa por etiqueta: primero las etiquetas conocidas (en su orden) y luego cualquier otra.
// Las etiquetas sin notas no se muestran.
function notasPorEtiqueta(lista) {
  const mapa = new Map();
  ETIQUETAS_NOTA.forEach((e) => mapa.set(e, []));
  lista.forEach((n) => {
    const e = n.etiqueta || "General";
    if (!mapa.has(e)) mapa.set(e, []);
    mapa.get(e).push(n);
  });
  return [...mapa].filter(([, l]) => l.length);
}

function crearTarjetaNota(n) {
  const hex = hexDeColor(n.color);
  const tarjeta = document.createElement("div");
  tarjeta.className = "tarjeta-nota";
  tarjeta.style.setProperty("--fondo", hex);
  aplicarContraste(tarjeta, hex);
  const nombre = document.createElement("div");
  nombre.className = "tarjeta-nombre";
  nombre.textContent = n.nombre || "Sin nombre";
  const etiqueta = document.createElement("span");
  etiqueta.className = "tarjeta-etiqueta";
  etiqueta.textContent = n.etiqueta || "General";
  const meta = document.createElement("div");
  meta.className = "tarjeta-meta";
  meta.appendChild(etiqueta);
  if (n.identificador) {
    const ident = document.createElement("span");
    ident.className = "tarjeta-ident";
    ident.title = "Identificador";
    ident.textContent = "#" + n.identificador;
    meta.appendChild(ident);
  }
  const fecha = document.createElement("div");
  fecha.className = "tarjeta-fecha";
  dibujarFechaNota(fecha, n);
  const texto = document.createElement("p");
  texto.className = "tarjeta-texto";
  texto.textContent = n.texto;
  const borrar = document.createElement("button");
  borrar.type = "button";
  borrar.className = "tarjeta-borrar";
  borrar.setAttribute("aria-label", "Eliminar nota");
  borrar.textContent = "×";
  borrar.addEventListener("click", (e) => {
    e.stopPropagation();
    borrarNota(n.id);
  });
  tarjeta.append(nombre, meta, fecha, texto, borrar);

  // Tocar la tarjeta en cualquier zona abre su edición (los botones ✎ y × siguen con su función)
  tarjeta.tabIndex = 0;
  tarjeta.setAttribute("role", "button");
  tarjeta.setAttribute("aria-label", "Editar la nota " + (n.nombre || "Sin nombre"));
  tarjeta.addEventListener("click", (e) => {
    if (e.target.closest("button, input")) return;
    if (String(window.getSelection()).length) return; // si estaba seleccionando texto, no se abre
    abrirEdicionNota(n);
  });
  tarjeta.addEventListener("keydown", (e) => {
    if (e.target === tarjeta && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      abrirEdicionNota(n);
    }
  });
  return tarjeta;
}

function dibujarNotas() {
  notasLista.innerHTML = "";
  if (!notas.length) {
    const p = document.createElement("p");
    p.className = "notas-vacio";
    p.textContent = "Aún no hay notas. ¡Escribe la primera! ✨";
    notasLista.appendChild(p);
    cerrarSubmenu();
    dibujarZonasEtiqueta(); // Actividades y Trabajo usan las mismas notas
    return;
  }
  notasPorEtiqueta(notasOrdenadas()).forEach(([etiqueta, lista]) => {
    const seccion = document.createElement("section");
    seccion.className = "notas-grupo";

    const titulo = document.createElement("h3");
    titulo.className = "notas-grupo-titulo";
    const nombreEt = document.createElement("span");
    nombreEt.textContent = etiqueta;
    const cuenta = document.createElement("span");
    cuenta.className = "notas-grupo-cuenta";
    cuenta.textContent = String(lista.length);
    titulo.append(nombreEt, cuenta);

    // Fila: las primeras 4 notas una al lado de la otra y, si hay más, el botón a la derecha
    const fila = document.createElement("div");
    fila.className = "notas-grupo-fila";
    const tarjetas = document.createElement("div");
    tarjetas.className = "notas-grupo-cards";
    lista.slice(0, MAX_FILA_NOTAS).forEach((n) => tarjetas.appendChild(crearTarjetaNota(n)));
    fila.appendChild(tarjetas);
    if (lista.length > MAX_FILA_NOTAS) {
      const mas = document.createElement("button");
      mas.type = "button";
      mas.className = "notas-grupo-mas";
      mas.setAttribute("aria-label", "Ver las " + lista.length + " notas de " + etiqueta);
      mas.innerHTML =
        '<span>Ver todas</span><span class="notas-grupo-num"></span>' +
        '<span class="flecha-mas" aria-hidden="true">›</span>';
      mas.querySelector(".notas-grupo-num").textContent = "(" + lista.length + ")";
      mas.addEventListener("click", () => abrirSubmenu(etiqueta));
      fila.appendChild(mas);
    }

    seccion.append(titulo, fila);
    notasLista.appendChild(seccion);
  });
  dibujarSubmenu(); // si hay un submenú abierto, se actualiza también
  dibujarZonasEtiqueta(); // Actividades y Trabajo usan las mismas notas
}

// Submenú: todas las notas de una etiqueta
function abrirSubmenu(etiqueta) {
  etiquetaAbierta = etiqueta;
  notasSubmenu.hidden = false;
  dibujarSubmenu();
  notasSubVolver.focus();
}
function cerrarSubmenu() {
  etiquetaAbierta = null;
  notasSubmenu.hidden = true;
  notasSubLista.innerHTML = "";
}
function dibujarSubmenu() {
  if (etiquetaAbierta === null) return;
  const lista = notasOrdenadas().filter((n) => (n.etiqueta || "General") === etiquetaAbierta);
  if (!lista.length) {
    cerrarSubmenu();
    return;
  }
  notasSubTitulo.textContent = etiquetaAbierta + " (" + lista.length + ")";
  notasSubLista.innerHTML = "";
  lista.forEach((n) => notasSubLista.appendChild(crearTarjetaNota(n)));
}

async function cargarNotas() {
  setEstado(notasEstadoLista, "Cargando…");
  try {
    const j = await llamarNotas("nota_listar");
    notas = Array.isArray(j.notas) ? j.notas : [];
    notasCargadas = true;
    dibujarNotas();
    setEstado(notasEstadoLista, "");
    if (etiquetaPendiente) irAEtiquetaNotas(etiquetaPendiente);
  } catch (e) {
    etiquetaPendiente = null;
    setEstado(notasEstadoLista, "Error: " + e.message, "error");
  }
}

async function agregarNota() {
  const texto = notasTexto.value.trim();
  if (!texto) {
    setEstado(notasEstado, "Escribe algo primero", "error");
    return;
  }
  const nota = {
    id: String(Date.now()),
    nombre: notasNombre.value.trim() || "Sin nombre",
    // La fecha se puede cambiar en el formulario; si queda vacía se usa la actual
    fecha: inputAFecha(notasFecha.value) || selloFechaHora(),
    etiqueta: notasEtiqueta.value,
    texto,
    color: colorElegido,
    identificador: notasIdent.value.trim(),
  };
  notasGuardar.disabled = true;
  setEstado(notasEstado, "Guardando…");
  try {
    await llamarNotas("nota_agregar", nota);
    notas.push(nota);
    limpiarFormNota();
    dibujarNotas();
    setEstado(notasEstado, "");
    mostrarFormNota(false);
    setEstado(notasEstadoLista, "Guardada ✓", "ok");
  } catch (e) {
    setEstado(notasEstado, "Error: " + e.message, "error");
  } finally {
    notasGuardar.disabled = false;
  }
}

async function editarNota() {
  const n = notaEditando;
  if (!n) return;
  const texto = notasTexto.value.trim();
  if (!texto) {
    setEstado(notasEstado, "Escribe algo primero", "error");
    return;
  }
  const cambios = {
    nombre: notasNombre.value.trim() || "Sin nombre",
    fecha: inputAFecha(notasFecha.value) || n.fecha || selloFechaHora(),
    etiqueta: notasEtiqueta.value,
    texto,
    color: colorElegido,
    identificador: notasIdent.value.trim(),
  };
  notasGuardar.disabled = true;
  setEstado(notasEstado, "Guardando…");
  try {
    await llamarNotas("nota_editar", Object.assign({ id: n.id }, cambios));
    Object.assign(n, cambios);
    limpiarFormNota();
    mostrarFormNota(false);
    dibujarNotas();
    setEstado(notasEstadoLista, "Cambios guardados ✓", "ok");
  } catch (e) {
    setEstado(notasEstado, "Error: " + e.message, "error");
  } finally {
    notasGuardar.disabled = false;
  }
}

async function borrarNota(id) {
  if (!window.confirm("¿Eliminar esta nota?")) return;
  setEstado(notasEstadoLista, "Eliminando…");
  try {
    await llamarNotas("nota_borrar", { id });
    notas = notas.filter((n) => n.id !== id);
    dibujarNotas();
    setEstado(notasEstadoLista, "Eliminada", "ok");
  } catch (e) {
    setEstado(notasEstadoLista, "Error: " + e.message, "error");
  }
}

// Muestra el aviso de inicio de sesión o el contenido, según la sesión
function actualizarPanelNotas() {
  actualizarPanelProyectos(); // la sesión también afecta a los paneles de Proyectos y Galería
  actualizarPanelGaleria();
  actualizarPanelEjercicio(); // y al de Ejercicio
  actualizarPanelDiario(); // y al de Diario
  actualizarPanelDeudas(); // y al de Deudas
  actualizarPanelInformacion(); // y al de Información Primordial
  actualizarPanelComandos(); // y al de Comandos
  actualizarPanelBazar(); // y al de Bazar
  actualizarPanelHoy(); // y al de Día de Hoy
  actualizarZonasEtiqueta(); // y a las zonas de Actividades y Trabajo
  if (typeof actualizarNotarios === "function") actualizarNotarios(); // y a los Notarios de todas las zonas
  actualizarCalendarioSesion(); // y a los datos del calendario
  if (panelNotas.hidden) return;
  const dentro = sesionVigente();
  notasSinSesion.hidden = dentro;
  notasContenido.hidden = !dentro;
  if (dentro) {
    if (!notasCargadas) cargarNotas();
  } else {
    notasCargadas = false;
    notas = [];
  }
}

// Se llama al entrar a la página de Notas (desde mostrarSeccion)
function entrarNotas() {
  panelNotas.hidden = false;
  mostrarFormNota(false); // al abrir, primero se ve la lista de notas
  cerrarSubmenu();
  actualizarPanelNotas();
}

// Desde la barra lateral o el acceso directo: cierra la barra y cambia a la página de Notas
function abrirNotas() {
  etiquetaPendiente = null;
  cerrarLateral();
  mostrarSeccion("seccion-notas");
}

// Notas ya es una página: aquí solo se sale de la edición o del submenú (se cambia de página con el menú)
function cerrarNotas() {
  if (notaEditando) cancelarEdicionNota();
  cerrarSubmenu();
}

btnNotas.addEventListener("click", abrirNotas);
// El botón «Notas» del menú principal (data-seccion="seccion-notas") cambia de página como los demás botones
// El botón «Ejercicio» del menú principal (btn-menu-ejercicio) abre su propio calendario (más abajo)
document.getElementById("notas-cerrar").addEventListener("click", cerrarNotas);
document.getElementById("notas-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarNotas();
  else actualizarPanelNotas();
});
document.getElementById("notas-ir-login").addEventListener("click", () => {
  cerrarNotas();
  abrirLateral();
});
notasGuardar.addEventListener("click", () => (notaEditando ? editarNota() : agregarNota()));
notasNuevaBtn.addEventListener("click", () => mostrarFormNota(true));
notasCancelar.addEventListener("click", () => {
  if (!confirmarAbandonoNota()) return;
  if (notaEditando) cancelarEdicionNota();
  else {
    limpiarFormNota(); // si había algo escrito y se aceptó abandonarlo, se descarta
    mostrarFormNota(false);
  }
});
notasSubVolver.addEventListener("click", cerrarSubmenu);
// Tocar el fondo oscuro (fuera de la caja) cierra el panel; Esc también
panelNotas.addEventListener("click", (e) => {
  if (e.target === panelNotas) cerrarNotas();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panelNotas.hidden) {
    // Esc cierra primero la edición, luego el submenú y, si no hay, el panel de notas
    if (notaEditando) {
      if (confirmarAbandonoNota()) cancelarEdicionNota();
    } else if (etiquetaAbierta !== null) cerrarSubmenu();
    else cerrarNotas();
  }
});

// ---------- Proyectos (hoja «Proyectos» de Google Sheets; imágenes en imgbb) ----------
const btnProyectos = document.getElementById("btn-proyectos");
const panelProyectos = document.getElementById("panel-proyectos");
const proySinSesion = document.getElementById("proy-sin-sesion");
const proyContenido = document.getElementById("proy-contenido");
const proyGrid = document.getElementById("proy-grid");
const proyEstadoLista = document.getElementById("proy-estado-lista");
const proyForm = document.getElementById("proy-form");
const proyFormTitulo = document.getElementById("proy-form-titulo");
const proyVista = document.getElementById("proy-vista");
const proyElegirImg = document.getElementById("proy-elegir-img");
const proyQuitarImg = document.getElementById("proy-quitar-img");
const proyArchivo = document.getElementById("proy-archivo");
const proyNombre = document.getElementById("proy-nombre");
const proyFecha = document.getElementById("proy-fecha");
const proyDescripcion = document.getElementById("proy-descripcion");
const proyLinks = document.getElementById("proy-links");
const proyLinksVista = document.getElementById("proy-links-vista");
const proyGuardar = document.getElementById("proy-guardar");
const proyCancelar = document.getElementById("proy-cancelar");
const proyBorrar = document.getElementById("proy-borrar");
const proyEstado = document.getElementById("proy-estado");

let proyectos = []; // [{ id, nombre, fecha, descripcion, imagen, links }]
let proyectosCargados = false;
let proyectoEditando = null; // proyecto abierto en el formulario (null = proyecto nuevo)
let proyImagenUrl = ""; // imagen actual del proyecto (URL de imgbb)
let proyImagenNueva = null; // { base64, vista } cuando se eligió una imagen que aún no se sube
const MAX_LADO_IMAGEN = 1600; // las fotos se reducen a este tamaño antes de subirlas

// Más recientes primero (según su fecha)
function proyectosOrdenados() {
  const orden = proyectos.map((p, i) => ({ p, i, t: marcaTiempo(p.fecha) }));
  orden.sort((x, y) => {
    const tx = isNaN(x.t) ? -Infinity : x.t;
    const ty = isNaN(y.t) ? -Infinity : y.t;
    return tx === ty ? y.i - x.i : ty - tx;
  });
  return orden.map((o) => o.p);
}

// ----- Links: uno por línea en la hoja y en el formulario -----
function enlacesDeTexto(t) {
  return String(t || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}
// Solo se enlazan direcciones http(s) (o dominios sin "https://"); lo demás se muestra como texto
function hrefSeguro(s) {
  if (/^https?:\/\/\S+$/i.test(s)) return s;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(s) && /^[^\s\/]+\.[^\s\/]{2,}(\/\S*)?$/.test(s)) return "https://" + s;
  return "";
}
function dibujarLinksProyecto() {
  proyLinksVista.innerHTML = "";
  enlacesDeTexto(proyLinks.value).forEach((l) => {
    const href = hrefSeguro(l);
    const el = document.createElement(href ? "a" : "span");
    if (href) {
      el.href = href;
      el.target = "_blank";
      el.rel = "noopener noreferrer";
    }
    el.textContent = l;
    proyLinksVista.appendChild(el);
  });
}
proyLinks.addEventListener("input", dibujarLinksProyecto);

// ----- Imagen: se reduce en el navegador y el Apps Script la sube a imgbb -----
function leerImagenReducida(archivo) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, MAX_LADO_IMAGEN / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const lienzo = document.createElement("canvas");
      lienzo.width = w;
      lienzo.height = h;
      const ctx = lienzo.getContext("2d");
      ctx.fillStyle = "#fff"; // las transparencias quedan en blanco al guardar como JPG
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const vista = lienzo.toDataURL("image/jpeg", 0.85);
      resolve({ vista, base64: vista.split(",")[1] });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen"));
    };
    img.src = url;
  });
}

function imagenValida(u) {
  return /^https?:\/\/\S+$/i.test(String(u || ""));
}

function dibujarVistaImagen() {
  proyVista.innerHTML = "";
  const src = proyImagenNueva ? proyImagenNueva.vista : proyImagenUrl;
  if (src && (proyImagenNueva || imagenValida(src))) {
    const img = document.createElement("img");
    img.alt = "Imagen del proyecto";
    img.referrerPolicy = "no-referrer";
    img.src = src;
    proyVista.appendChild(img);
  } else {
    proyVista.textContent = "Sin imagen";
  }
  proyQuitarImg.hidden = !(proyImagenNueva || proyImagenUrl);
  proyElegirImg.textContent = proyImagenNueva || proyImagenUrl ? "Cambiar imagen" : "Elegir imagen";
}

proyElegirImg.addEventListener("click", () => proyArchivo.click());
proyQuitarImg.addEventListener("click", () => {
  proyImagenNueva = null;
  proyImagenUrl = "";
  proyArchivo.value = "";
  dibujarVistaImagen();
});
proyArchivo.addEventListener("change", async () => {
  const archivo = proyArchivo.files && proyArchivo.files[0];
  if (!archivo) return;
  setEstado(proyEstado, "Preparando imagen…");
  try {
    proyImagenNueva = await leerImagenReducida(archivo);
    dibujarVistaImagen();
    setEstado(proyEstado, "");
  } catch (e) {
    setEstado(proyEstado, "Error: " + e.message, "error");
  }
  proyArchivo.value = "";
});

// ----- Cuadrícula -----
function crearTileProyecto(p) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "proy-tile";
  b.setAttribute("aria-label", "Editar el proyecto " + (p.nombre || "Sin nombre"));
  const vacio = () => {
    const v = document.createElement("span");
    v.className = "proy-tile-vacio";
    v.setAttribute("aria-hidden", "true");
    v.textContent = "🖼️";
    return v;
  };
  if (imagenValida(p.imagen)) {
    const img = document.createElement("img");
    img.alt = "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.src = p.imagen;
    img.addEventListener("error", () => img.replaceWith(vacio()));
    b.appendChild(img);
  } else {
    b.appendChild(vacio());
  }
  const nombre = document.createElement("span");
  nombre.className = "proy-tile-nombre";
  nombre.textContent = p.nombre || "Sin nombre";
  b.appendChild(nombre);
  b.addEventListener("click", () => abrirFormProyecto(p));
  return b;
}

function dibujarProyectos() {
  proyGrid.innerHTML = "";
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "proy-tile proy-tile-nuevo";
  nuevo.setAttribute("aria-label", "Agregar un proyecto nuevo");
  nuevo.innerHTML = '<span class="proy-mas" aria-hidden="true">+</span><span>Nuevo proyecto</span>';
  nuevo.addEventListener("click", () => abrirFormProyecto(null));
  proyGrid.appendChild(nuevo);
  proyectosOrdenados().forEach((p) => proyGrid.appendChild(crearTileProyecto(p)));
}

// ----- Ventana de edición -----
function abrirFormProyecto(p) {
  proyectoEditando = p;
  proyImagenUrl = p ? p.imagen || "" : "";
  proyImagenNueva = null;
  proyFormTitulo.textContent = p ? "Editar proyecto" : "Nuevo proyecto";
  proyNombre.value = p ? (p.nombre === "Sin nombre" ? "" : p.nombre || "") : "";
  proyFecha.value = (p && fechaAInput(p.fecha)) || fechaActualInput();
  proyDescripcion.value = p ? p.descripcion || "" : "";
  proyLinks.value = p ? enlacesDeTexto(p.links).join("\n") : "";
  proyGuardar.textContent = p ? "Guardar cambios" : "Guardar proyecto";
  proyBorrar.hidden = !p;
  setEstado(proyEstado, "");
  dibujarVistaImagen();
  dibujarLinksProyecto();
  proyForm.hidden = false;
  proyForm.scrollTop = 0;
  proyNombre.focus();
}

function cerrarFormProyecto() {
  proyForm.hidden = true;
  proyectoEditando = null;
  proyImagenNueva = null;
  proyImagenUrl = "";
  proyArchivo.value = "";
}

async function guardarProyecto() {
  const nombre = proyNombre.value.trim();
  if (!nombre) {
    setEstado(proyEstado, "Escribe un nombre", "error");
    return;
  }
  proyGuardar.disabled = true;
  try {
    // 1) Si se eligió una imagen nueva, se sube a imgbb a través del Apps Script
    if (proyImagenNueva) {
      setEstado(proyEstado, "Subiendo imagen…");
      const j = await llamarNotas("proyecto_imagen", { imagen: proyImagenNueva.base64 });
      proyImagenUrl = j.url;
      proyImagenNueva = null; // si el guardado falla, no se vuelve a subir
    }
    // 2) Se guarda el proyecto en la hoja
    setEstado(proyEstado, "Guardando…");
    const datos = {
      nombre,
      fecha: inputAFecha(proyFecha.value) || (proyectoEditando && proyectoEditando.fecha) || selloFechaHora(),
      descripcion: proyDescripcion.value.trim(),
      imagen: proyImagenUrl,
      links: enlacesDeTexto(proyLinks.value).join("\n"),
    };
    if (proyectoEditando) {
      await llamarNotas("proyecto_editar", Object.assign({ id: proyectoEditando.id }, datos));
      Object.assign(proyectoEditando, datos);
    } else {
      const nuevo = Object.assign({ id: String(Date.now()) }, datos);
      await llamarNotas("proyecto_agregar", nuevo);
      proyectos.push(nuevo);
    }
    cerrarFormProyecto();
    dibujarProyectos();
    setEstado(proyEstadoLista, "Guardado ✓", "ok");
  } catch (e) {
    setEstado(proyEstado, "Error: " + e.message, "error");
  } finally {
    proyGuardar.disabled = false;
  }
}

async function borrarProyecto() {
  const p = proyectoEditando;
  if (!p || !window.confirm("¿Eliminar este proyecto? (la imagen seguirá en imgbb)")) return;
  proyBorrar.disabled = true;
  setEstado(proyEstado, "Eliminando…");
  try {
    await llamarNotas("proyecto_borrar", { id: p.id });
    proyectos = proyectos.filter((x) => x.id !== p.id);
    cerrarFormProyecto();
    dibujarProyectos();
    setEstado(proyEstadoLista, "Eliminado", "ok");
  } catch (e) {
    setEstado(proyEstado, "Error: " + e.message, "error");
  } finally {
    proyBorrar.disabled = false;
  }
}

async function cargarProyectos() {
  setEstado(proyEstadoLista, "Cargando…");
  try {
    const j = await llamarNotas("proyecto_listar");
    proyectos = Array.isArray(j.proyectos) ? j.proyectos : [];
    proyectosCargados = true;
    dibujarProyectos();
    setEstado(proyEstadoLista, "");
  } catch (e) {
    setEstado(proyEstadoLista, "Error: " + e.message, "error");
  }
}

function actualizarPanelProyectos() {
  if (panelProyectos.hidden) return;
  const dentro = sesionVigente();
  proySinSesion.hidden = dentro;
  proyContenido.hidden = !dentro;
  if (dentro) {
    if (!proyectosCargados) cargarProyectos();
  } else {
    proyectosCargados = false;
    proyectos = [];
    cerrarFormProyecto();
  }
}

function abrirProyectos() {
  cerrarLateral();
  panelProyectos.hidden = false;
  cerrarFormProyecto();
  actualizarPanelProyectos();
}
function cerrarProyectos() {
  cerrarFormProyecto();
  panelProyectos.hidden = true;
}

btnProyectos.addEventListener("click", abrirProyectos);
document.getElementById("proy-cerrar").addEventListener("click", cerrarProyectos);
document.getElementById("proy-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarProyectos();
  else actualizarPanelProyectos();
});
document.getElementById("proy-ir-login").addEventListener("click", () => {
  cerrarProyectos();
  abrirLateral();
});
proyGuardar.addEventListener("click", guardarProyecto);
proyCancelar.addEventListener("click", cerrarFormProyecto);
proyBorrar.addEventListener("click", borrarProyecto);
// Tocar el fondo oscuro (fuera de la caja) cierra el panel; Esc cierra primero la ventana de edición
panelProyectos.addEventListener("click", (e) => {
  if (e.target === panelProyectos) cerrarProyectos();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panelProyectos.hidden) {
    if (!proyForm.hidden) cerrarFormProyecto();
    else cerrarProyectos();
  }
});

// ---------- Notas: abrir el submenú de una etiqueta ----------
// Muestra el submenú con todas las notas de una etiqueta (o avisa si todavía no hay ninguna)
function irAEtiquetaNotas(etiqueta) {
  etiquetaPendiente = null;
  if (notas.some((n) => (n.etiqueta || "General") === etiqueta)) abrirSubmenu(etiqueta);
  else setEstado(notasEstadoLista, "Aún no hay notas con la etiqueta «" + etiqueta + "»");
}


// ---------- Galería (hoja «Galeria» de Google Sheets; imágenes en imgbb) ----------
const ETIQUETAS_GALERIA = ["General", "Programacion", "Contenido Digital", "Perfiles"];

const panelGaleria = document.getElementById("panel-galeria");
const galSinSesion = document.getElementById("gal-sin-sesion");
const galContenido = document.getElementById("gal-contenido");
const galFiltros = document.getElementById("gal-filtros");
const galGrid = document.getElementById("gal-grid");
const galEstadoLista = document.getElementById("gal-estado-lista");
const galForm = document.getElementById("gal-form");
const galFormTitulo = document.getElementById("gal-form-titulo");
const galVista = document.getElementById("gal-vista");
const galElegirImg = document.getElementById("gal-elegir-img");
const galArchivo = document.getElementById("gal-archivo");
const galEtiqueta = document.getElementById("gal-etiqueta");
const galDescripcion = document.getElementById("gal-descripcion");
const galGuardar = document.getElementById("gal-guardar");
const galBorrar = document.getElementById("gal-borrar");
const galEstado = document.getElementById("gal-estado");

let galeria = []; // [{ id, imagen, descripcion, etiqueta }]
let galeriaCargada = false;
let galeriaEditando = null; // imagen abierta en el formulario (null = imagen nueva)
let galImagenUrl = ""; // imagen actual (URL de imgbb)
let galImagenNueva = null; // { base64, vista } cuando se eligió una imagen que aún no se sube
let galFiltro = "Todas";

ETIQUETAS_GALERIA.forEach((e) => {
  const op = document.createElement("option");
  op.value = e;
  op.textContent = e;
  galEtiqueta.appendChild(op);
});

// Las más recientes (las últimas de la hoja) primero, y solo las de la etiqueta elegida
function galeriaVisible() {
  const lista = galeria.slice().reverse();
  return galFiltro === "Todas" ? lista : lista.filter((g) => (g.etiqueta || "General") === galFiltro);
}

function dibujarFiltrosGaleria() {
  galFiltros.innerHTML = "";
  ["Todas"].concat(ETIQUETAS_GALERIA).forEach((e) => {
    const n = e === "Todas" ? galeria.length : galeria.filter((g) => (g.etiqueta || "General") === e).length;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "gal-chip" + (e === galFiltro ? " activo" : "");
    b.setAttribute("aria-pressed", e === galFiltro ? "true" : "false");
    b.textContent = e + " (" + n + ")";
    b.addEventListener("click", () => {
      galFiltro = e;
      dibujarGaleria();
    });
    galFiltros.appendChild(b);
  });
}

function crearTileGaleria(g) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "proy-tile";
  b.setAttribute("aria-label", "Editar la imagen " + (g.descripcion || g.etiqueta || ""));
  const vacio = () => {
    const v = document.createElement("span");
    v.className = "proy-tile-vacio";
    v.setAttribute("aria-hidden", "true");
    v.textContent = "🖼️";
    return v;
  };
  if (imagenValida(g.imagen)) {
    const img = document.createElement("img");
    img.alt = g.descripcion || "";
    img.loading = "lazy";
    img.referrerPolicy = "no-referrer";
    img.src = g.imagen;
    img.addEventListener("error", () => img.replaceWith(vacio()));
    b.appendChild(img);
  } else {
    b.appendChild(vacio());
  }
  const pildora = document.createElement("span");
  pildora.className = "gal-pildora";
  pildora.textContent = g.etiqueta || "General";
  b.appendChild(pildora);
  if (g.descripcion) {
    const d = document.createElement("span");
    d.className = "proy-tile-nombre";
    d.textContent = g.descripcion;
    b.appendChild(d);
  }
  b.addEventListener("click", () => abrirFormGaleria(g));
  return b;
}

function dibujarGaleria() {
  dibujarFiltrosGaleria();
  galGrid.innerHTML = "";
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "proy-tile proy-tile-nuevo";
  nuevo.setAttribute("aria-label", "Agregar una imagen nueva");
  nuevo.innerHTML = '<span class="proy-mas" aria-hidden="true">+</span><span>Nueva imagen</span>';
  nuevo.addEventListener("click", () => abrirFormGaleria(null));
  galGrid.appendChild(nuevo);
  galeriaVisible().forEach((g) => galGrid.appendChild(crearTileGaleria(g)));
}

// ----- Ventana de edición -----
function dibujarVistaGaleria() {
  galVista.innerHTML = "";
  const src = galImagenNueva ? galImagenNueva.vista : galImagenUrl;
  if (src && (galImagenNueva || imagenValida(src))) {
    const img = document.createElement("img");
    img.alt = "Imagen de la galería";
    img.referrerPolicy = "no-referrer";
    img.src = src;
    galVista.appendChild(img);
  } else {
    galVista.textContent = "Sin imagen";
  }
  galElegirImg.textContent = galImagenNueva || galImagenUrl ? "Cambiar imagen" : "Elegir imagen";
}

galElegirImg.addEventListener("click", () => galArchivo.click());
galArchivo.addEventListener("change", async () => {
  const archivo = galArchivo.files && galArchivo.files[0];
  if (!archivo) return;
  setEstado(galEstado, "Preparando imagen…");
  try {
    galImagenNueva = await leerImagenReducida(archivo);
    dibujarVistaGaleria();
    setEstado(galEstado, "");
  } catch (e) {
    setEstado(galEstado, "Error: " + e.message, "error");
  }
  galArchivo.value = "";
});

function abrirFormGaleria(g) {
  galeriaEditando = g;
  galImagenUrl = g ? g.imagen || "" : "";
  galImagenNueva = null;
  galFormTitulo.textContent = g ? "Editar imagen" : "Nueva imagen";
  // Al agregar, se preselecciona la etiqueta del filtro activo
  const sugerida = g ? g.etiqueta : galFiltro;
  galEtiqueta.value = ETIQUETAS_GALERIA.includes(sugerida) ? sugerida : "General";
  galDescripcion.value = g ? g.descripcion || "" : "";
  galGuardar.textContent = g ? "Guardar cambios" : "Guardar imagen";
  galBorrar.hidden = !g;
  setEstado(galEstado, "");
  dibujarVistaGaleria();
  galForm.hidden = false;
  galForm.scrollTop = 0;
  galElegirImg.focus();
}

function cerrarFormGaleria() {
  galForm.hidden = true;
  galeriaEditando = null;
  galImagenNueva = null;
  galImagenUrl = "";
  galArchivo.value = "";
}

async function guardarGaleria() {
  if (!galImagenNueva && !galImagenUrl) {
    setEstado(galEstado, "Elige una imagen", "error");
    return;
  }
  galGuardar.disabled = true;
  try {
    if (galImagenNueva) {
      setEstado(galEstado, "Subiendo imagen…");
      const j = await llamarNotas("proyecto_imagen", { imagen: galImagenNueva.base64 });
      galImagenUrl = j.url;
      galImagenNueva = null; // si el guardado falla, no se vuelve a subir
    }
    setEstado(galEstado, "Guardando…");
    const datos = {
      imagen: galImagenUrl,
      descripcion: galDescripcion.value.trim(),
      etiqueta: galEtiqueta.value,
    };
    if (galeriaEditando) {
      await llamarNotas("galeria_editar", Object.assign({ id: galeriaEditando.id }, datos));
      Object.assign(galeriaEditando, datos);
    } else {
      const nueva = Object.assign({ id: String(Date.now()) }, datos);
      await llamarNotas("galeria_agregar", nueva);
      galeria.push(nueva);
    }
    cerrarFormGaleria();
    dibujarGaleria();
    setEstado(galEstadoLista, "Guardado ✓", "ok");
  } catch (e) {
    setEstado(galEstado, "Error: " + e.message, "error");
  } finally {
    galGuardar.disabled = false;
  }
}

async function borrarGaleria() {
  const g = galeriaEditando;
  if (!g || !window.confirm("¿Eliminar esta imagen de la galería? (seguirá en imgbb)")) return;
  galBorrar.disabled = true;
  setEstado(galEstado, "Eliminando…");
  try {
    await llamarNotas("galeria_borrar", { id: g.id });
    galeria = galeria.filter((x) => x.id !== g.id);
    cerrarFormGaleria();
    dibujarGaleria();
    setEstado(galEstadoLista, "Eliminada", "ok");
  } catch (e) {
    setEstado(galEstado, "Error: " + e.message, "error");
  } finally {
    galBorrar.disabled = false;
  }
}

async function cargarGaleria() {
  setEstado(galEstadoLista, "Cargando…");
  try {
    const j = await llamarNotas("galeria_listar");
    galeria = Array.isArray(j.galeria) ? j.galeria : [];
    galeriaCargada = true;
    dibujarGaleria();
    setEstado(galEstadoLista, "");
  } catch (e) {
    setEstado(galEstadoLista, "Error: " + e.message, "error");
  }
}

function actualizarPanelGaleria() {
  if (panelGaleria.hidden) return;
  const dentro = sesionVigente();
  galSinSesion.hidden = dentro;
  galContenido.hidden = !dentro;
  if (dentro) {
    if (!galeriaCargada) cargarGaleria();
  } else {
    galeriaCargada = false;
    galeria = [];
    cerrarFormGaleria();
  }
}

function abrirGaleria() {
  cerrarLateral();
  panelGaleria.hidden = false;
  cerrarFormGaleria();
  actualizarPanelGaleria();
}
function cerrarGaleria() {
  cerrarFormGaleria();
  panelGaleria.hidden = true;
}

document.getElementById("btn-galeria").addEventListener("click", abrirGaleria);
document.getElementById("gal-cerrar").addEventListener("click", cerrarGaleria);
document.getElementById("gal-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarGaleria();
  else actualizarPanelGaleria();
});
document.getElementById("gal-ir-login").addEventListener("click", () => {
  cerrarGaleria();
  abrirLateral();
});
galGuardar.addEventListener("click", guardarGaleria);
document.getElementById("gal-cancelar").addEventListener("click", cerrarFormGaleria);
galBorrar.addEventListener("click", borrarGaleria);
// Tocar el fondo oscuro cierra el panel; Esc cierra primero la ventana de edición
panelGaleria.addEventListener("click", (e) => {
  if (e.target === panelGaleria) cerrarGaleria();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !panelGaleria.hidden) {
    if (!galForm.hidden) cerrarFormGaleria();
    else cerrarGaleria();
  }
});

// ---------- Actividades y Trabajo (hoja «Notas» con una etiqueta fija) ----------
// Cada zona vive dentro de su sección del menú superior y tiene su propio botón de crear, con el
// mismo formulario de las notas, pero la etiqueta ya viene fija (Actividades o Trabajo).
// Usan la misma lista `notas` y la misma hoja que el panel de Notas: lo que se crea aquí también
// aparece allí, en su fila de etiqueta, y lo que se cambia en un lado se ve en el otro.
// Las etiquetas deben estar también en ETIQUETAS_NOTA (arriba) y en el Apps Script.
const ZONAS_ETIQUETA = [
  {
    seccion: "actividades", etiqueta: "Actividades", datos: "tus actividades",
    crear: "+ Crear actividad", nuevo: "Nueva actividad", editar: "Editar actividad",
    guardar: "Guardar actividad", marcador: "Escribe una actividad nueva…",
    vacio: "Aún no hay actividades. ¡Crea la primera! ✨", borrar: "¿Eliminar esta actividad?",
  },
  {
    seccion: "trabajo", etiqueta: "Trabajo", datos: "tus trabajos",
    crear: "+ Crear trabajo", nuevo: "Nuevo trabajo", editar: "Editar trabajo",
    guardar: "Guardar trabajo", marcador: "Escribe un trabajo nuevo…",
    vacio: "Aún no hay trabajos. ¡Crea el primero! ✨", borrar: "¿Eliminar este trabajo?",
    vista: true, // al tocar una tarjeta se abre primero una nota sencilla (la tuerca abre la edición)
    finalizar: true, // cada tarjeta lleva el botón «Marcar tarea como finalizada» (pasa al Diario)
  },
  {
    // Sección propia (se abre desde el botón «Pedidos de Yeso» de la barra lateral, no desde el menú superior)
    seccion: "pedidos-yeso", etiqueta: "Pedidos de Yeso", datos: "tus pedidos de yeso",
    crear: "+ Crear pedido", nuevo: "Nuevo pedido", editar: "Editar pedido",
    guardar: "Guardar pedido", marcador: "Escribe un pedido nuevo…",
    vacio: "Aún no hay pedidos de yeso. ¡Crea el primero! ✨", borrar: "¿Eliminar este pedido?",
  },
];

// Arma una zona: formulario (igual al de Notas), botón de crear y lista de tarjetas de su etiqueta
function crearZonaEtiqueta(cfg) {
  const cont = document.getElementById("zona-" + cfg.seccion);
  cont.innerHTML = `
    <div class="zona-sin-sesion notas-aviso-sesion" hidden>
      <p>Inicia sesión con tu cuenta de Google para ver y guardar ${cfg.datos}.</p>
      <button type="button" class="notas-btn zona-ir-login">Iniciar sesión</button>
    </div>
    <div class="zona-contenido" hidden>
      <div class="notas-barra">
        <button type="button" class="notas-btn zona-nueva-btn">${cfg.crear}</button>
        <button type="button" class="notas-btn-icono zona-actualizar"
                title="Volver a leer ${cfg.datos} de Google Sheets" aria-label="Actualizar ${cfg.datos}">&#8635;</button>
        <span class="notas-estado zona-estado-lista"></span>
      </div>
      <div class="notas-nueva zona-form" hidden>
        <h3 class="notas-form-titulo zona-form-titulo">${cfg.nuevo}</h3>
        <div class="notas-superior">
          <label class="notas-campo notas-campo-etiqueta">
            <span>Etiqueta</span>
            <input class="zona-etiqueta-fija" type="text" value="${cfg.etiqueta}" readonly tabindex="-1" />
          </label>
          <div class="notas-campo notas-campo-color">
            <span>Color</span>
            <div class="notas-colores zona-colores" role="radiogroup" aria-label="Color"></div>
            <button type="button" class="notas-enlace zona-mas-colores" aria-expanded="false">Más colores ▾</button>
            <div class="notas-paleta zona-paleta" hidden>
              <div class="zona-paleta-familias"></div>
              <label class="notas-personal zona-personal">
                <input class="zona-color-personal" type="color" value="#ffffff" aria-label="Elegir cualquier color" />
                <span>Elegir cualquier otro color</span>
              </label>
            </div>
          </div>
        </div>
        <div class="notas-campos notas-campos-par">
          <label class="notas-campo">
            <span>Fecha y hora</span>
            <input class="zona-fecha" type="datetime-local" />
          </label>
          <label class="notas-campo">
            <span>Identificador (1, 2, 3… o una palabra)</span>
            <input class="zona-ident" type="text" maxlength="40" placeholder="Opcional" autocomplete="off" />
          </label>
        </div>
        <label class="notas-campo notas-campo-nombre">
          <span>Nombre</span>
          <input class="zona-nombre" type="text" maxlength="80" placeholder="Nombre" autocomplete="off" />
        </label>
        <textarea class="zona-texto" rows="4" maxlength="5000"
                  placeholder="${cfg.marcador}" aria-label="${cfg.nuevo}"></textarea>
        <div class="notas-fila">
          <button type="button" class="notas-btn zona-guardar">${cfg.guardar}</button>
          <button type="button" class="notas-btn notas-btn-sec zona-cancelar">Cancelar</button>
          <span class="notas-estado zona-estado"></span>
        </div>
      </div>
      <div class="notas-grid zona-lista"></div>
    </div>`;

  const q = (s) => cont.querySelector(s);
  const z = {
    cfg,
    seccion: document.getElementById(cfg.seccion),
    sinSesion: q(".zona-sin-sesion"),
    contenido: q(".zona-contenido"),
    nuevoBtn: q(".zona-nueva-btn"),
    estadoLista: q(".zona-estado-lista"),
    form: q(".zona-form"),
    titulo: q(".zona-form-titulo"),
    nombre: q(".zona-nombre"),
    colores: q(".zona-colores"),
    masColores: q(".zona-mas-colores"),
    paleta: q(".zona-paleta"),
    familias: q(".zona-paleta-familias"),
    personal: q(".zona-personal"),
    colorPersonal: q(".zona-color-personal"),
    fecha: q(".zona-fecha"),
    ident: q(".zona-ident"),
    texto: q(".zona-texto"),
    guardarBtn: q(".zona-guardar"),
    estado: q(".zona-estado"),
    lista: q(".zona-lista"),
    editando: null, // nota que se está editando (null = nueva)
    color: "Blanco",
    snap: "", // valores del formulario al abrirlo (para saber si se cambió algo)
  };

  // ----- Color (igual que en Notas: pasteles, paleta completa y selector libre) -----
  function elegirColorZona(valor) {
    z.color = valor;
    const hex = hexDeColor(valor);
    z.form.style.setProperty("--fondo-nota", hex);
    aplicarContraste(z.form, hex);
    let enMuestra = false;
    z.form.querySelectorAll(".color-op").forEach((b) => {
      const activo = b.dataset.color.toLowerCase() === String(valor).toLowerCase();
      if (activo) enMuestra = true;
      b.classList.toggle("elegido", activo);
      b.setAttribute("aria-checked", activo ? "true" : "false");
    });
    z.colorPersonal.value = hex;
    z.personal.classList.toggle("elegido", !enMuestra);
  }
  function muestraColorZona(valor, hex, titulo) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "color-op";
    b.dataset.color = valor;
    b.title = titulo;
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", titulo);
    b.style.background = hex;
    b.addEventListener("click", () => elegirColorZona(valor));
    return b;
  }
  COLORES_NOTA.forEach((c) => z.colores.appendChild(muestraColorZona(c.nombre, c.hex, c.nombre)));
  PALETA_COLORES.forEach((f) => {
    const fila = document.createElement("div");
    fila.className = "paleta-fila";
    const nombre = document.createElement("span");
    nombre.className = "paleta-nombre";
    nombre.textContent = f.titulo;
    const grupo = document.createElement("div");
    grupo.className = "notas-colores";
    grupo.setAttribute("role", "radiogroup");
    grupo.setAttribute("aria-label", f.titulo);
    f.colores.forEach((hex) => grupo.appendChild(muestraColorZona(hex, hex, f.titulo + " " + hex)));
    fila.append(nombre, grupo);
    z.familias.appendChild(fila);
  });
  z.colorPersonal.addEventListener("input", () => elegirColorZona(z.colorPersonal.value.toLowerCase()));
  z.masColores.addEventListener("click", () => {
    const abrir = z.paleta.hidden;
    z.paleta.hidden = !abrir;
    z.masColores.setAttribute("aria-expanded", abrir ? "true" : "false");
    z.masColores.textContent = abrir ? "Menos colores ▴" : "Más colores ▾";
  });
  elegirColorZona("Blanco");

  // ----- Nota sencilla (solo nombre, fecha y descripción); la tuerca abre la edición -----
  let vista = null;
  if (cfg.vista) {
    vista = document.createElement("div");
    vista.className = "zona-vista";
    vista.hidden = true;
    vista.innerHTML = `
      <div class="zona-vista-caja" role="dialog" aria-modal="true">
        <div class="zona-vista-botones">
          <button type="button" class="zona-vista-btn zona-vista-cerrar" aria-label="Cerrar" title="Cerrar">&times;</button>
          <button type="button" class="zona-vista-btn zona-vista-tuerca" aria-label="Modificar" title="Modificar">&#9881;&#65039;</button>
        </div>
        <h3 class="zona-vista-nombre"></h3>
        <div class="zona-vista-fecha"></div>
        <p class="zona-vista-texto"></p>
      </div>`;
    cont.appendChild(vista);
  }
  let viendo = null;
  function cerrarVista() {
    if (!vista) return;
    vista.hidden = true;
    viendo = null;
  }
  function abrirVista(n) {
    viendo = n;
    const caja = vista.querySelector(".zona-vista-caja");
    const hex = hexDeColor(n.color);
    caja.style.setProperty("--fondo", hex);
    aplicarContraste(caja, hex);
    vista.querySelector(".zona-vista-nombre").textContent = n.nombre || "Sin nombre";
    vista.querySelector(".zona-vista-fecha").textContent = n.fecha || "";
    vista.querySelector(".zona-vista-texto").textContent = n.texto || "";
    vista.hidden = false;
    vista.querySelector(".zona-vista-cerrar").focus();
  }
  // Al tocar una tarjeta: nota sencilla (si la zona la usa) o edición directa
  function abrirTarjeta(n) {
    if (vista) abrirVista(n);
    else abrirEdicion(n);
  }
  if (vista) {
    vista.querySelector(".zona-vista-cerrar").addEventListener("click", cerrarVista);
    vista.querySelector(".zona-vista-tuerca").addEventListener("click", () => {
      const n = viendo;
      cerrarVista();
      if (n) abrirEdicion(n);
    });
    // Tocar el fondo oscuro (fuera de la nota) la cierra; Esc también
    vista.addEventListener("click", (e) => {
      if (e.target === vista) cerrarVista();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !vista.hidden) cerrarVista();
    });
  }

  // ----- Formulario -----
  function limpiarForm() {
    z.texto.value = "";
    z.nombre.value = "";
    z.ident.value = "";
    elegirColorZona("Blanco");
    z.fecha.value = fechaActualInput();
  }
  // Muestra u oculta el formulario (el botón de crear hace lo contrario); siempre vuelve a modo «nuevo»
  function mostrarForm(mostrar) {
    z.editando = null;
    z.titulo.textContent = cfg.nuevo;
    z.guardarBtn.textContent = cfg.guardar;
    z.form.hidden = !mostrar;
    z.nuevoBtn.hidden = mostrar;
    if (mostrar) {
      z.fecha.value = fechaActualInput();
      setEstado(z.estado, "");
      z.nombre.focus();
      z.snap = z.valores();
    }
  }
  function cancelar() {
    limpiarForm();
    mostrarForm(false);
  }

  // Tocar una tarjeta: el mismo formulario, con sus datos, aquí mismo en la zona
  function abrirEdicion(n) {
    if (z.sucio() && !window.confirm("Tienes cambios sin guardar. ¿Descartarlos para editar este?")) return;
    z.editando = n;
    z.nombre.value = n.nombre === "Sin nombre" ? "" : n.nombre || "";
    const c = String(n.color || "").trim();
    const colorValido = /^#[0-9a-fA-F]{6}$/.test(c) || COLORES_NOTA.some((x) => x.nombre === c);
    elegirColorZona(colorValido ? (c.startsWith("#") ? c.toLowerCase() : c) : "Blanco");
    z.fecha.value = fechaAInput(n.fecha) || fechaActualInput();
    z.ident.value = n.identificador || "";
    z.texto.value = n.texto || "";
    z.titulo.textContent = cfg.editar;
    z.guardarBtn.textContent = "Guardar cambios";
    setEstado(z.estado, "");
    z.form.hidden = false;
    z.nuevoBtn.hidden = true;
    z.form.scrollIntoView({ behavior: "smooth", block: "nearest" });
    z.snap = z.valores();
    z.nombre.focus();
  }

  // ----- Guardar (nueva o editada) y borrar -----
  async function guardar() {
    const texto = z.texto.value.trim();
    if (!texto) {
      setEstado(z.estado, "Escribe algo primero", "error");
      return;
    }
    const n = z.editando;
    const datos = {
      nombre: z.nombre.value.trim() || "Sin nombre",
      fecha: inputAFecha(z.fecha.value) || (n && n.fecha) || selloFechaHora(),
      etiqueta: cfg.etiqueta, // siempre la de la zona
      texto,
      color: z.color,
      identificador: z.ident.value.trim(),
    };
    z.guardarBtn.disabled = true;
    setEstado(z.estado, "Guardando…");
    try {
      if (n) {
        await llamarNotas("nota_editar", Object.assign({ id: n.id }, datos));
        Object.assign(n, datos);
      } else {
        const nota = Object.assign({ id: String(Date.now()) }, datos);
        await llamarNotas("nota_agregar", nota);
        notas.push(nota);
      }
      limpiarForm();
      mostrarForm(false);
      dibujarNotas(); // redibuja el panel de Notas y todas las zonas
      setEstado(z.estadoLista, n ? "Cambios guardados ✓" : "Guardada ✓", "ok");
    } catch (e) {
      setEstado(z.estado, "Error: " + e.message, "error");
    } finally {
      z.guardarBtn.disabled = false;
    }
  }

  async function borrar(id) {
    if (!window.confirm(cfg.borrar)) return;
    setEstado(z.estadoLista, "Eliminando…");
    try {
      await llamarNotas("nota_borrar", { id });
      notas = notas.filter((n) => n.id !== id);
      if (z.editando && z.editando.id === id) cancelar();
      dibujarNotas();
      setEstado(z.estadoLista, "Eliminada", "ok");
    } catch (e) {
      setEstado(z.estadoLista, "Error: " + e.message, "error");
    }
  }

  // ----- Finalizar un trabajo: sale de Notas y entra al Diario, en el día de hoy -----
  async function finalizar(n, botonSi) {
    const ahora = new Date();
    const fecha = claveFecha(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    botonSi.disabled = true;
    setEstado(z.estadoLista, "Finalizando…");
    try {
      await llamarNotas("trabajo_finalizar", { id: n.id, fecha });
      notas = notas.filter((x) => x.id !== n.id);
      if (z.editando && z.editando.id === n.id) cancelar();
      dibujarNotas(); // el trabajo desaparece de Trabajo y de la lista de Notas
      registrarTerminadoEnDiario({
        id: n.id,
        nombre: n.nombre || "Sin nombre",
        fecha,
        descripcion: n.texto || "",
        terminado: true,
      });
      setEstado(z.estadoLista, "Trabajo finalizado ✓ (ya está en el Diario)", "ok");
    } catch (e) {
      botonSi.disabled = false;
      setEstado(z.estadoLista, "Error: " + e.message, "error");
    }
  }

  // ----- Lista de tarjetas (solo las de esta etiqueta) -----
  function crearTarjeta(n) {
    const hex = hexDeColor(n.color);
    const tarjeta = document.createElement("div");
    tarjeta.className = "tarjeta-nota";
    tarjeta.style.setProperty("--fondo", hex);
    aplicarContraste(tarjeta, hex);
    const nombre = document.createElement("div");
    nombre.className = "tarjeta-nombre";
    nombre.textContent = n.nombre || "Sin nombre";
    tarjeta.appendChild(nombre);
    if (n.identificador) {
      const meta = document.createElement("div");
      meta.className = "tarjeta-meta";
      const ident = document.createElement("span");
      ident.className = "tarjeta-ident";
      ident.title = "Identificador";
      ident.textContent = "#" + n.identificador;
      meta.appendChild(ident);
      tarjeta.appendChild(meta);
    }
    const fecha = document.createElement("div");
    fecha.className = "tarjeta-fecha";
    fecha.textContent = n.fecha;
    const texto = document.createElement("p");
    texto.className = "tarjeta-texto";
    texto.textContent = n.texto;
    const x = document.createElement("button");
    x.type = "button";
    x.className = "tarjeta-borrar";
    x.setAttribute("aria-label", "Eliminar");
    x.textContent = "×";
    x.addEventListener("click", (e) => {
      e.stopPropagation();
      borrar(n.id);
    });
    tarjeta.append(fecha, texto, x);

    // Botón «Marcar tarea como finalizada»: pide confirmación y pasa el trabajo al Diario
    if (cfg.finalizar) {
      const fin = document.createElement("div");
      fin.className = "tarjeta-finalizar";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tarjeta-fin-btn";
      btn.textContent = "✔ Marcar tarea como finalizada";
      const conf = document.createElement("div");
      conf.className = "tarjeta-fin-conf";
      conf.hidden = true;
      const aviso = document.createElement("p");
      aviso.className = "tarjeta-fin-aviso";
      aviso.textContent = "¿Seguro? Se quitará de Trabajo y pasará al Diario con la fecha de hoy.";
      const si = document.createElement("button");
      si.type = "button";
      si.className = "tarjeta-fin-si";
      si.textContent = "Sí, finalizar";
      const no = document.createElement("button");
      no.type = "button";
      no.className = "tarjeta-fin-no";
      no.textContent = "Cancelar";
      conf.append(aviso, si, no);
      btn.addEventListener("click", () => {
        btn.hidden = true;
        conf.hidden = false;
      });
      no.addEventListener("click", () => {
        conf.hidden = true;
        btn.hidden = false;
      });
      si.addEventListener("click", () => finalizar(n, si));
      // Tocar esta zona no abre la nota
      fin.addEventListener("click", (e) => e.stopPropagation());
      fin.append(btn, conf);
      tarjeta.appendChild(fin);
    }

    // Tocar la tarjeta en cualquier zona abre su edición (la × sigue con su función)
    tarjeta.tabIndex = 0;
    tarjeta.setAttribute("role", "button");
    tarjeta.setAttribute("aria-label", (vista ? "Ver " : "Editar ") + (n.nombre || "Sin nombre"));
    tarjeta.addEventListener("click", (e) => {
      if (e.target.closest("button, input")) return;
      if (String(window.getSelection()).length) return; // si estaba seleccionando texto, no se abre
      abrirTarjeta(n);
    });
    tarjeta.addEventListener("keydown", (e) => {
      if (e.target === tarjeta && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        abrirTarjeta(n);
      }
    });
    return tarjeta;
  }

  z.dibujar = function () {
    z.lista.innerHTML = "";
    const lista = notasOrdenadas().filter((n) => (n.etiqueta || "General") === cfg.etiqueta);
    if (!lista.length) {
      const p = document.createElement("p");
      p.className = "notas-vacio";
      p.textContent = cfg.vacio;
      z.lista.appendChild(p);
      return;
    }
    lista.forEach((n) => z.lista.appendChild(crearTarjeta(n)));
  };

  // Aviso de inicio de sesión o contenido, según la sesión (devuelve si hay sesión)
  z.actualizar = function () {
    const dentro = sesionVigente();
    z.sinSesion.hidden = dentro;
    z.contenido.hidden = !dentro;
    if (!dentro) {
      cerrarVista();
      cancelar();
    }
    return dentro;
  };

  z.valores = () => JSON.stringify([z.nombre.value, z.color, z.fecha.value, z.ident.value, z.texto.value]);
  z.sucio = () => !z.form.hidden && z.valores() !== z.snap;
  z.cancelar = cancelar;
  const cancelarConAviso = () => {
    if (!z.sucio() || window.confirm(MENSAJE_ABANDONAR)) cancelar();
  };

  z.nuevoBtn.addEventListener("click", () => mostrarForm(true));
  z.guardarBtn.addEventListener("click", guardar);
  z.form.querySelector(".zona-cancelar").addEventListener("click", cancelarConAviso);
  z.form.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cancelarConAviso();
  });
  q(".zona-actualizar").addEventListener("click", () => {
    if (sesionVigente()) cargarNotasZonas();
    else z.actualizar();
  });
  q(".zona-ir-login").addEventListener("click", abrirLateral);
  return z;
}

const zonas = ZONAS_ETIQUETA.map(crearZonaEtiqueta);
let cargandoZonas = false;

// Lee las notas de la hoja (las mismas que usa el panel de Notas) y redibuja todo
async function cargarNotasZonas() {
  if (cargandoZonas) return;
  cargandoZonas = true;
  zonas.forEach((z) => setEstado(z.estadoLista, "Cargando…"));
  try {
    const j = await llamarNotas("nota_listar");
    notas = Array.isArray(j.notas) ? j.notas : [];
    notasCargadas = true;
    dibujarNotas();
    zonas.forEach((z) => setEstado(z.estadoLista, ""));
  } catch (e) {
    zonas.forEach((z) => setEstado(z.estadoLista, "Error: " + e.message, "error"));
  } finally {
    cargandoZonas = false;
  }
}

function dibujarZonasEtiqueta() {
  zonas.forEach((z) => z.dibujar());
}

// Se llama cuando cambia la sesión (desde actualizarPanelNotas)
function actualizarZonasEtiqueta() {
  const dentro = sesionVigente();
  zonas.forEach((z) => z.actualizar());
  if (!dentro) {
    notasCargadas = false;
    notas = [];
    dibujarZonasEtiqueta();
  } else if (!notasCargadas && zonas.some((z) => !z.seccion.hidden)) {
    cargarNotasZonas();
  }
}

// Botón «Pedidos de Yeso» de la barra lateral: abre su propia sección (aparte de Notas)
document.getElementById("btn-yeso").addEventListener("click", () => {
  cerrarLateral();
  mostrarSeccion("pedidos-yeso");
  const z = zonas.find((x) => x.cfg.seccion === "pedidos-yeso");
  if (z.actualizar() && !notasCargadas) cargarNotasZonas();
  else z.dibujar();
});

// Al abrir una de estas secciones se muestra su zona (y se leen las notas si aún no se han leído)
botonesMenu.forEach((b) =>
  b.addEventListener("click", () => {
    const z = zonas.find((x) => x.cfg.seccion === b.dataset.seccion);
    if (!z) return;
    if (z.actualizar() && !notasCargadas) cargarNotasZonas();
    else z.dibujar();
  })
);

// ---------- Color del día (recuadro del calendario y fondo del panel) ----------
// Usa los mismos colores que las notas. El color de cada día se guarda en la hoja «Colores».
const popColores = document.getElementById("pop-colores");
const popMasColores = document.getElementById("pop-mas-colores");
const popPaleta = document.getElementById("pop-paleta");
const popPaletaFamilias = document.getElementById("pop-paleta-familias");
const popPersonal = document.getElementById("pop-personal");
const popColorPersonal = document.getElementById("pop-color-personal");
const popColorQuitar = document.getElementById("pop-color-quitar");
const popColorEstado = document.getElementById("pop-color-estado");

// Pinta el panel con el color del día (sin color = negro de siempre) y marca la muestra elegida
function pintarPanelDia(valor) {
  const c = String(valor || "").trim();
  const hex = c ? hexDeColor(c) : "";
  if (hex) {
    const oscuro = esColorOscuro(hex);
    popover.style.setProperty("--pop-fondo", hex);
    popover.style.setProperty("--pop-titulo", oscuro ? "#ffffff" : "#2b2140");
    popover.style.setProperty("--pop-cierre", oscuro ? "#f0eafc" : "#4a3f66");
  } else {
    ["--pop-fondo", "--pop-titulo", "--pop-cierre"].forEach((p) => popover.style.removeProperty(p));
  }
  let enMuestra = false;
  document.querySelectorAll("#pop-color .color-op").forEach((b) => {
    const activo = !!c && b.dataset.color.toLowerCase() === c.toLowerCase();
    if (activo) enMuestra = true;
    b.classList.toggle("elegido", activo);
    b.setAttribute("aria-checked", activo ? "true" : "false");
  });
  popColorPersonal.value = hex || "#ffffff";
  popPersonal.classList.toggle("elegido", !!c && !enMuestra);
  popColorQuitar.hidden = !c;
}

function plegarPaletaDia() {
  popPaleta.hidden = true;
  popMasColores.setAttribute("aria-expanded", "false");
  popMasColores.textContent = "Más colores ▾";
}

// Guarda el color de un día en la hoja «Colores» (color vacío = quitarlo)
async function guardarColorDia(fecha, color) {
  if (!configurado()) throw new Error("Falta configurar config.js");
  const idToken = credencialVigente();
  if (!idToken) {
    abrirLateral();
    throw new Error("Inicia sesión con Google para guardar");
  }
  // text/plain evita el "preflight" de CORS con Apps Script
  const r = await fetch(CONFIG.APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: CONFIG.TOKEN, idToken, accion: "calendario_color", fecha, color }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Error al guardar");
}

let secuenciaColorDia = 0;
// Cambia el color del día: se ve al instante y, si no se puede guardar, vuelve al anterior
async function cambiarColorDia(fecha, valor) {
  const anterior = String((datos[fecha] || {}).color || "");
  const orden = ++secuenciaColorDia;
  datos[fecha] = datos[fecha] || {};
  datos[fecha].color = valor;
  pintarPanelDia(valor);
  dibujarCalendario();
  setEstado(popColorEstado, "Guardando…");
  try {
    await guardarColorDia(fecha, valor);
    if (orden === secuenciaColorDia) setEstado(popColorEstado, "Guardado ✓", "ok");
  } catch (e) {
    if (orden !== secuenciaColorDia) return;
    datos[fecha] = datos[fecha] || {};
    datos[fecha].color = anterior;
    if (seleccion === fecha) pintarPanelDia(anterior);
    dibujarCalendario();
    setEstado(popColorEstado, "Error: " + e.message, "error");
  }
}

function muestraColorDia(valor, hex, titulo) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "color-op";
  b.dataset.color = valor;
  b.title = titulo;
  b.setAttribute("role", "radio");
  b.setAttribute("aria-label", titulo);
  b.style.background = hex;
  b.addEventListener("click", () => {
    if (seleccion) cambiarColorDia(seleccion, valor);
  });
  return b;
}
COLORES_NOTA.forEach((c) => popColores.appendChild(muestraColorDia(c.nombre, c.hex, c.nombre)));
PALETA_COLORES.forEach((f) => {
  const fila = document.createElement("div");
  fila.className = "paleta-fila";
  const nombre = document.createElement("span");
  nombre.className = "paleta-nombre";
  nombre.textContent = f.titulo;
  const grupo = document.createElement("div");
  grupo.className = "notas-colores";
  grupo.setAttribute("role", "radiogroup");
  grupo.setAttribute("aria-label", f.titulo);
  f.colores.forEach((hex) => grupo.appendChild(muestraColorDia(hex, hex, f.titulo + " " + hex)));
  fila.append(nombre, grupo);
  popPaletaFamilias.appendChild(fila);
});
// Selector libre: mientras se arrastra solo se ve; el color se guarda al soltar
popColorPersonal.addEventListener("input", () => pintarPanelDia(popColorPersonal.value.toLowerCase()));
popColorPersonal.addEventListener("change", () => {
  if (seleccion) cambiarColorDia(seleccion, popColorPersonal.value.toLowerCase());
});
popColorQuitar.addEventListener("click", () => {
  if (seleccion) cambiarColorDia(seleccion, "");
});
popMasColores.addEventListener("click", () => {
  const abrir = popPaleta.hidden;
  popPaleta.hidden = !abrir;
  popMasColores.setAttribute("aria-expanded", abrir ? "true" : "false");
  popMasColores.textContent = abrir ? "Menos colores ▴" : "Más colores ▾";
});

// ---------- Ejercicio (hoja «Ejercicio» de Google Sheets) ----------
// Calendario aparte del principal: cada día guarda los ejercicios que hiciste (Nombre | Fecha | Descripcion | Id).
const ejEl = (id) => document.getElementById(id);
const panelEj = ejEl("panel-ejercicio");
const ejSinSesion = ejEl("ej-sin-sesion");
const ejContenido = ejEl("ej-contenido");
const ejEstado = ejEl("ej-estado");
const ejSelMes = ejEl("ej-mes");
const ejSelAnio = ejEl("ej-anio");
const ejAnterior = ejEl("ej-anterior");
const ejSiguiente = ejEl("ej-siguiente");
const ejCuad = ejEl("ej-cuadricula");
const ejDiaPanel = ejEl("ej-dia");
const ejDiaTitulo = ejEl("ej-dia-titulo");
const ejDiaEstado = ejEl("ej-dia-estado");
const ejChips = ejEl("ej-chips");
const ejForm = ejEl("ej-form");
const ejFormTitulo = ejEl("ej-form-titulo");
const ejNombre = ejEl("ej-nombre");
const ejDescripcion = ejEl("ej-descripcion");
const ejGuardar = ejEl("ej-guardar");
const ejBorrar = ejEl("ej-borrar");
const ejFormEstado = ejEl("ej-form-estado");

let ejercicios = []; // [{ id, nombre, fecha: "AAAA-MM-DD", descripcion }]
let ejCargados = false;
let ejMes = new Date().getMonth();
let ejAnio = new Date().getFullYear();
let ejDia = null; // día abierto en el submenú
let ejEditando = null; // ejercicio abierto en la ventana (null = ejercicio nuevo)

MESES.forEach((n, i) => ejSelMes.add(new Option(n, i)));
for (let a = ANIO_MIN; a <= ANIO_MAX; a++) ejSelAnio.add(new Option(a, a));

const ejDeDia = (fecha) => ejercicios.filter((e) => e.fecha === fecha);

// ----- Calendario de ejercicio (igual al principal, pero con sus propios datos) -----
function dibujarCalendarioEj() {
  ejSelMes.value = ejMes;
  ejSelAnio.value = ejAnio;
  ejAnterior.disabled = ejAnio === ANIO_MIN && ejMes === 0;
  ejSiguiente.disabled = ejAnio === ANIO_MAX && ejMes === 11;
  ejCuad.innerHTML = "";
  DIAS.forEach((d) => {
    const el = document.createElement("div");
    el.className = "cal-dia-semana";
    el.textContent = d;
    ejCuad.appendChild(el);
  });
  const ahora = new Date();
  const primerDia = (new Date(ejAnio, ejMes, 1).getDay() + 6) % 7;
  const diasEnMes = new Date(ejAnio, ejMes + 1, 0).getDate();
  for (let i = 0; i < primerDia; i++) {
    const vacio = document.createElement("div");
    vacio.className = "cal-dia vacio";
    ejCuad.appendChild(vacio);
  }
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = claveFecha(ejAnio, ejMes, d);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cal-dia";
    el.textContent = d;
    el.dataset.fecha = fecha;
    if ((primerDia + d - 1) % 7 >= 5) el.classList.add("finde");
    if (d === ahora.getDate() && ejMes === ahora.getMonth() && ejAnio === ahora.getFullYear()) el.classList.add("hoy");
    if (fecha === ejDia) el.classList.add("seleccionado");
    if (ejDeDia(fecha).length) el.classList.add("con-datos");
    el.addEventListener("click", () => abrirDiaEj(fecha));
    ejCuad.appendChild(el);
  }
}

function ejCambiarMes(delta) {
  ejMes += delta;
  if (ejMes < 0) { ejMes = 11; ejAnio--; }
  if (ejMes > 11) { ejMes = 0; ejAnio++; }
  ejAnio = Math.max(ANIO_MIN, Math.min(ANIO_MAX, ejAnio));
  dibujarCalendarioEj();
}

// ----- Submenú del día: un botón cuadrado por ejercicio + un "+" para añadir -----
function dibujarChipsEj() {
  ejChips.innerHTML = "";
  ejDeDia(ejDia).forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip";
    b.title = e.nombre;
    b.setAttribute("aria-label", "Ver o editar el ejercicio " + e.nombre);
    b.innerHTML = '<span class="ej-chip-icono" aria-hidden="true">💪</span><span class="ej-chip-nombre"></span>';
    b.querySelector(".ej-chip-nombre").textContent = e.nombre;
    b.addEventListener("click", () => abrirFormEj(e));
    ejChips.appendChild(b);
  });
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "ej-chip ej-chip-nuevo";
  nuevo.setAttribute("aria-label", "Añadir un ejercicio");
  nuevo.innerHTML = '<span class="ej-chip-icono" aria-hidden="true">+</span><span class="ej-chip-nombre">Añadir</span>';
  nuevo.addEventListener("click", () => abrirFormEj(null));
  ejChips.appendChild(nuevo);
}

function abrirDiaEj(fecha) {
  ejDia = fecha;
  ejDiaTitulo.textContent = textoFecha(fecha);
  setEstado(ejDiaEstado, "");
  dibujarChipsEj();
  ejDiaPanel.hidden = false;
  dibujarCalendarioEj();
}
function cerrarDiaEj() {
  cerrarFormEj();
  ejDiaPanel.hidden = true;
  ejDia = null;
  dibujarCalendarioEj();
}

// ----- Ventana para añadir / editar -----
function abrirFormEj(e) {
  ejEditando = e;
  ejFormTitulo.textContent = e ? "Editar ejercicio" : "Nuevo ejercicio";
  ejNombre.value = e ? e.nombre : "";
  ejDescripcion.value = e ? e.descripcion : "";
  ejBorrar.hidden = !e;
  setEstado(ejFormEstado, "");
  ejForm.hidden = false;
  ejNombre.focus();
}
function cerrarFormEj() {
  ejForm.hidden = true;
  ejEditando = null;
}

async function guardarEj() {
  const nombre = ejNombre.value.trim();
  if (!nombre) {
    setEstado(ejFormEstado, "Escribe el nombre del ejercicio", "error");
    return;
  }
  const editando = ejEditando;
  const id = editando ? editando.id : String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const e = { id, nombre, fecha: editando ? editando.fecha : ejDia, descripcion: ejDescripcion.value.trim() };
  ejGuardar.disabled = true;
  setEstado(ejFormEstado, "Guardando…");
  try {
    await llamarNotas(editando ? "ejercicio_editar" : "ejercicio_agregar", e);
    if (editando) ejercicios = ejercicios.map((x) => (x.id === id ? e : x));
    else ejercicios.push(e);
    cerrarFormEj();
    dibujarChipsEj();
    dibujarCalendarioEj();
  } catch (err) {
    setEstado(ejFormEstado, "Error: " + err.message, "error");
  } finally {
    ejGuardar.disabled = false;
  }
}

async function borrarEj() {
  const e = ejEditando;
  if (!e || !window.confirm("¿Eliminar el ejercicio «" + e.nombre + "»?")) return;
  ejBorrar.disabled = true;
  setEstado(ejFormEstado, "Eliminando…");
  try {
    await llamarNotas("ejercicio_borrar", { id: e.id });
    ejercicios = ejercicios.filter((x) => x.id !== e.id);
    cerrarFormEj();
    dibujarChipsEj();
    dibujarCalendarioEj();
  } catch (err) {
    setEstado(ejFormEstado, "Error: " + err.message, "error");
  } finally {
    ejBorrar.disabled = false;
  }
}

// ----- Carga y sesión -----
async function cargarEjercicios() {
  setEstado(ejEstado, "Cargando…");
  try {
    const j = await llamarNotas("ejercicio_listar");
    ejercicios = Array.isArray(j.ejercicios) ? j.ejercicios : [];
    ejCargados = true;
    setEstado(ejEstado, "");
    dibujarCalendarioEj();
    if (ejDia) dibujarChipsEj();
    // El Diario también muestra los ejercicios hechos cada día
    dibujarCalendarioDi();
    if (diDia) dibujarChipsDi();
  } catch (err) {
    setEstado(ejEstado, "Error: " + err.message, "error");
  }
}

function actualizarPanelEjercicio() {
  if (!sesionVigente()) {
    // Sin sesión no se guardan datos en pantalla (el Diario también usa estos ejercicios)
    ejCargados = false;
    ejercicios = [];
  }
  if (panelEj.hidden) return;
  const dentro = sesionVigente();
  ejSinSesion.hidden = dentro;
  ejContenido.hidden = !dentro;
  if (dentro) {
    if (!ejCargados) cargarEjercicios();
  } else {
    ejCargados = false;
    ejercicios = [];
    cerrarDiaEj();
  }
}

// Se llama al entrar a la página de Ejercicio (desde mostrarSeccion)
function entrarEjercicio() {
  const ahora = new Date();
  ejMes = ahora.getMonth(); // siempre abre en el mes actual
  ejAnio = ahora.getFullYear();
  ejDia = null;
  ejDiaPanel.hidden = true;
  cerrarFormEj();
  panelEj.hidden = false;
  dibujarCalendarioEj();
  actualizarPanelEjercicio();
}
// Ejercicio ya es una página: aquí solo se cierran el formulario y el submenú del día
function cerrarEjercicio() {
  cerrarFormEj();
  ejDiaPanel.hidden = true;
  ejDia = null;
}

ejEl("ej-cerrar").addEventListener("click", cerrarEjercicio);
ejEl("ej-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarEjercicios();
  else actualizarPanelEjercicio();
});
ejEl("ej-ir-login").addEventListener("click", () => {
  cerrarEjercicio();
  abrirLateral();
});
ejAnterior.addEventListener("click", () => ejCambiarMes(-1));
ejSiguiente.addEventListener("click", () => ejCambiarMes(1));
ejEl("ej-hoy").addEventListener("click", () => {
  const ahora = new Date();
  ejMes = ahora.getMonth();
  ejAnio = ahora.getFullYear();
  dibujarCalendarioEj();
});
ejSelMes.addEventListener("change", () => { ejMes = Number(ejSelMes.value); dibujarCalendarioEj(); });
ejSelAnio.addEventListener("change", () => { ejAnio = Number(ejSelAnio.value); dibujarCalendarioEj(); });
ejEl("ej-dia-volver").addEventListener("click", cerrarDiaEj);
ejGuardar.addEventListener("click", guardarEj);
ejEl("ej-cancelar").addEventListener("click", cerrarFormEj);
ejBorrar.addEventListener("click", borrarEj);
// Esc cierra primero la ventana y luego el submenú del día
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || panelEj.hidden) return;
  if (!ejForm.hidden) cerrarFormEj();
  else if (!ejDiaPanel.hidden) cerrarDiaEj();
});

// ---------- Diario (hoja «Diario» de Google Sheets) ----------
// Calendario aparte del principal: cada día guarda los diarios que hiciste (Nombre | Fecha | Descripcion | Id).
const diEl = (id) => document.getElementById(id);
const panelDi = diEl("panel-diario");
const diSinSesion = diEl("di-sin-sesion");
const diContenido = diEl("di-contenido");
const diEstado = diEl("di-estado");
const diSelMes = diEl("di-mes");
const diSelAnio = diEl("di-anio");
const diAnterior = diEl("di-anterior");
const diSiguiente = diEl("di-siguiente");
const diCuad = diEl("di-cuadricula");
const diDiaPanel = diEl("di-dia");
const diDiaTitulo = diEl("di-dia-titulo");
const diDiaEstado = diEl("di-dia-estado");
const diChips = diEl("di-chips");
const diForm = diEl("di-form");
const diFormTitulo = diEl("di-form-titulo");
const diNombre = diEl("di-nombre");
const diDescripcion = diEl("di-descripcion");
const diGuardar = diEl("di-guardar");
const diBorrar = diEl("di-borrar");
const diFormEstado = diEl("di-form-estado");
const diEjSub = diEl("di-ejercicios");
const diEjTitulo = diEl("di-ej-titulo");
const diEjChips = diEl("di-ej-chips");
const diEjDetalle = diEl("di-ej-detalle");

let diarios = []; // [{ id, nombre, fecha: "AAAA-MM-DD", descripcion }]
let diCargados = false;
let diMes = new Date().getMonth();
let diAnio = new Date().getFullYear();
let diDia = null; // día abierto en el submenú
let diEditando = null; // anotación abierto en la ventana (null = anotación nuevo)

// El Diario solo se puede explorar del 2 de febrero de 1999 al 2 de febrero de 2099
const DI_FECHA_MIN = "1999-02-02";
const DI_FECHA_MAX = "2099-02-02";
const DI_ANIO_MIN = Number(DI_FECHA_MIN.slice(0, 4));
const DI_ANIO_MAX = Number(DI_FECHA_MAX.slice(0, 4));

MESES.forEach((n, i) => diSelMes.add(new Option(n, i)));
for (let a = DI_ANIO_MIN; a <= DI_ANIO_MAX; a++) diSelAnio.add(new Option(a, a));

const diFechaValida = (fecha) => fecha >= DI_FECHA_MIN && fecha <= DI_FECHA_MAX;
// Un mes se puede ver si al menos uno de sus días está dentro del rango
function diMesValido(a, m) {
  const ultimo = new Date(a, m + 1, 0).getDate();
  return claveFecha(a, m, ultimo) >= DI_FECHA_MIN && claveFecha(a, m, 1) <= DI_FECHA_MAX;
}
// Si el mes/año elegido queda fuera del rango, se lleva al más cercano permitido
function ajustarMesDi() {
  if (claveFecha(diAnio, diMes, 1) > DI_FECHA_MAX) {
    diAnio = DI_ANIO_MAX;
    diMes = Number(DI_FECHA_MAX.slice(5, 7)) - 1;
  } else if (!diMesValido(diAnio, diMes)) {
    diAnio = DI_ANIO_MIN;
    diMes = Number(DI_FECHA_MIN.slice(5, 7)) - 1;
  }
}

const diDeDia = (fecha) => diarios.filter((e) => e.fecha === fecha);

// Un trabajo recién finalizado aparece en el Diario sin tener que recargar
// (si el Diario aún no se ha leído, se leerá completo al abrirlo)
function registrarTerminadoEnDiario(e) {
  if (!diCargados) return;
  if (!diarios.some((x) => x.id === e.id)) diarios.push(e);
  dibujarCalendarioDi();
  if (diDia) dibujarChipsDi();
}

// ----- Calendario de anotación (igual al principal, pero con sus propios datos) -----
function dibujarCalendarioDi() {
  ajustarMesDi();
  diSelMes.value = diMes;
  diSelAnio.value = diAnio;
  // Los meses que quedan fuera del rango (en 1999 y 2099) no se pueden elegir
  Array.from(diSelMes.options).forEach((o) => { o.disabled = !diMesValido(diAnio, Number(o.value)); });
  const mAnt = diMes === 0 ? 11 : diMes - 1;
  const aAnt = diMes === 0 ? diAnio - 1 : diAnio;
  const mSig = diMes === 11 ? 0 : diMes + 1;
  const aSig = diMes === 11 ? diAnio + 1 : diAnio;
  diAnterior.disabled = !diMesValido(aAnt, mAnt);
  diSiguiente.disabled = !diMesValido(aSig, mSig);
  diCuad.innerHTML = "";
  DIAS.forEach((d) => {
    const el = document.createElement("div");
    el.className = "cal-dia-semana";
    el.textContent = d;
    diCuad.appendChild(el);
  });
  const ahora = new Date();
  const primerDia = (new Date(diAnio, diMes, 1).getDay() + 6) % 7;
  const diasEnMes = new Date(diAnio, diMes + 1, 0).getDate();
  for (let i = 0; i < primerDia; i++) {
    const vacio = document.createElement("div");
    vacio.className = "cal-dia vacio";
    diCuad.appendChild(vacio);
  }
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = claveFecha(diAnio, diMes, d);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cal-dia";
    el.textContent = d;
    el.dataset.fecha = fecha;
    if ((primerDia + d - 1) % 7 >= 5) el.classList.add("finde");
    if (d === ahora.getDate() && diMes === ahora.getMonth() && diAnio === ahora.getFullYear()) el.classList.add("hoy");
    if (fecha === diDia) el.classList.add("seleccionado");
    if (diDeDia(fecha).length || ejDeDia(fecha).length) el.classList.add("con-datos");
    if (!diFechaValida(fecha)) {
      // Fuera del rango permitido (antes del 2/2/1999 o después del 2/2/2099)
      el.disabled = true;
      el.classList.add("fuera-rango");
    } else el.addEventListener("click", () => abrirDiaDi(fecha));
    diCuad.appendChild(el);
  }
}

function diCambiarMes(delta) {
  diMes += delta;
  if (diMes < 0) { diMes = 11; diAnio--; }
  if (diMes > 11) { diMes = 0; diAnio++; }
  dibujarCalendarioDi(); // aquí mismo se ajusta al rango permitido
}

// ----- Submenú del día: un botón cuadrado por anotación + un "+" para añadir -----
function dibujarChipsDi() {
  diChips.innerHTML = "";
  // Si ese día hiciste ejercicio, aparece un cuadro «Ejercicio» (al tocarlo se ven los ejercicios hechos)
  const hechos = ejDeDia(diDia);
  if (hechos.length) {
    const ej = document.createElement("button");
    ej.type = "button";
    ej.className = "ej-chip ej-chip-ejercicio";
    ej.title = "Ejercicio hecho este día";
    ej.setAttribute("aria-label", "Ver los " + hechos.length + " ejercicios hechos este día");
    ej.innerHTML = '<span class="ej-chip-icono" aria-hidden="true">💪</span><span class="ej-chip-nombre"></span>';
    ej.querySelector(".ej-chip-nombre").textContent = "Ejercicio (" + hechos.length + ")";
    ej.addEventListener("click", abrirEjerciciosDi);
    diChips.appendChild(ej);
  }
  diDeDia(diDia).forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip";
    b.title = e.nombre;
    b.setAttribute("aria-label", "Ver o editar la anotación " + e.nombre);
    b.innerHTML = '<span class="ej-chip-icono" aria-hidden="true"></span><span class="ej-chip-nombre"></span>';
    b.querySelector(".ej-chip-icono").textContent = e.terminado ? "✅" : "📓";
    if (e.terminado) b.title = e.nombre + " (trabajo terminado)";
    if (e.marca === "Tarea finalizada") {
      b.classList.add("ej-chip-finalizada");
      b.title = e.nombre + " (Anotación de Tarea Finalizada)";
    }
    b.querySelector(".ej-chip-nombre").textContent = e.nombre;
    b.addEventListener("click", () => abrirFormDi(e));
    diChips.appendChild(b);
  });
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "ej-chip ej-chip-nuevo";
  nuevo.setAttribute("aria-label", "Añadir una anotación");
  nuevo.innerHTML = '<span class="ej-chip-icono" aria-hidden="true">+</span><span class="ej-chip-nombre">Añadir</span>';
  nuevo.addEventListener("click", () => abrirFormDi(null));
  diChips.appendChild(nuevo);
}

function abrirDiaDi(fecha) {
  diDia = fecha;
  diDiaTitulo.textContent = textoFecha(fecha);
  setEstado(diDiaEstado, "");
  dibujarChipsDi();
  diDiaPanel.hidden = false;
  dibujarCalendarioDi();
}
// ----- Ejercicios hechos ese día (se leen de la hoja «Ejercicio»): mini cuadros con descripción breve -----
function resumenCorto(t, max) {
  const x = String(t || "").replace(/\s+/g, " ").trim();
  if (!x) return "Sin descripción";
  return x.length > max ? x.slice(0, max).trimEnd() + "…" : x;
}

function dibujarEjerciciosDi() {
  diEjChips.innerHTML = "";
  ejDeDia(diDia).forEach((e) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip ej-chip-resumen";
    b.setAttribute("aria-label", "Ver todo el ejercicio " + e.nombre);
    const n = document.createElement("span");
    n.className = "ej-chip-nombre";
    n.textContent = e.nombre;
    const d = document.createElement("span");
    d.className = "ej-chip-desc";
    d.textContent = resumenCorto(e.descripcion, 70);
    b.append(n, d);
    b.addEventListener("click", () => abrirDetalleEjDi(e));
    diEjChips.appendChild(b);
  });
}

function abrirEjerciciosDi() {
  if (!diDia) return;
  diEjTitulo.textContent = "💪 Ejercicio · " + textoFecha(diDia);
  dibujarEjerciciosDi();
  diEjSub.hidden = false;
}

function abrirDetalleEjDi(e) {
  diEl("di-ej-detalle-nombre").textContent = e.nombre || "Sin nombre";
  diEl("di-ej-detalle-fecha").textContent = textoFecha(e.fecha);
  diEl("di-ej-detalle-texto").textContent = e.descripcion || "Sin descripción";
  diEjDetalle.hidden = false;
  diEl("di-ej-detalle-cerrar").focus();
}
function cerrarDetalleEjDi() {
  diEjDetalle.hidden = true;
}
function cerrarEjerciciosDi() {
  cerrarDetalleEjDi();
  diEjSub.hidden = true;
}

function cerrarDiaDi() {
  cerrarEjerciciosDi();
  cerrarFormDi();
  diDiaPanel.hidden = true;
  diDia = null;
  dibujarCalendarioDi();
}

// ----- Ventana para añadir / editar -----
function abrirFormDi(e) {
  diEditando = e;
  diFormTitulo.textContent = e
    ? e.marca === "Tarea finalizada"
      ? "Anotación de Tarea Finalizada ✅"
      : e.terminado
      ? "Editar trabajo terminado ✅"
      : "Editar anotación"
    : "Nueva anotación";
  diNombre.value = e ? e.nombre : "";
  diDescripcion.value = e ? e.descripcion : "";
  diBorrar.hidden = !e;
  setEstado(diFormEstado, "");
  diForm.hidden = false;
  diNombre.focus();
}
function cerrarFormDi() {
  diForm.hidden = true;
  diEditando = null;
}

async function guardarDi() {
  const nombre = diNombre.value.trim();
  if (!nombre) {
    setEstado(diFormEstado, "Escribe el nombre de la anotación", "error");
    return;
  }
  const editando = diEditando;
  const id = editando ? editando.id : String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const e = {
    id,
    nombre,
    fecha: editando ? editando.fecha : diDia,
    descripcion: diDescripcion.value.trim(),
    terminado: editando ? !!editando.terminado : false, // solo informativo: el Apps Script no toca la columna D
  };
  diGuardar.disabled = true;
  setEstado(diFormEstado, "Guardando…");
  try {
    await llamarNotas(editando ? "diario_editar" : "diario_agregar", e);
    if (editando) diarios = diarios.map((x) => (x.id === id ? e : x));
    else diarios.push(e);
    cerrarFormDi();
    dibujarChipsDi();
    dibujarCalendarioDi();
  } catch (err) {
    setEstado(diFormEstado, "Error: " + err.message, "error");
  } finally {
    diGuardar.disabled = false;
  }
}

async function borrarDi() {
  const e = diEditando;
  if (!e || !window.confirm("¿Eliminar la anotación «" + e.nombre + "»?")) return;
  diBorrar.disabled = true;
  setEstado(diFormEstado, "Eliminando…");
  try {
    await llamarNotas("diario_borrar", { id: e.id });
    diarios = diarios.filter((x) => x.id !== e.id);
    cerrarFormDi();
    dibujarChipsDi();
    dibujarCalendarioDi();
  } catch (err) {
    setEstado(diFormEstado, "Error: " + err.message, "error");
  } finally {
    diBorrar.disabled = false;
  }
}

// ----- Carga y sesión -----
async function cargarDiarios() {
  setEstado(diEstado, "Cargando…");
  try {
    const j = await llamarNotas("diario_listar");
    diarios = Array.isArray(j.diarios) ? j.diarios : [];
    diCargados = true;
    setEstado(diEstado, "");
    dibujarCalendarioDi();
    if (diDia) dibujarChipsDi();
  } catch (err) {
    setEstado(diEstado, "Error: " + err.message, "error");
  }
}

// El Diario también muestra los ejercicios hechos: si aún no se han leído, se leen aquí
let ejCargando = false;
async function cargarEjerciciosParaDiario() {
  if (ejCargados || ejCargando || !sesionVigente()) return;
  ejCargando = true;
  try {
    await cargarEjercicios();
  } finally {
    ejCargando = false;
  }
}

function actualizarPanelDiario() {
  if (panelDi.hidden) return;
  const dentro = sesionVigente();
  diSinSesion.hidden = dentro;
  diContenido.hidden = !dentro;
  if (dentro) {
    if (!diCargados) cargarDiarios();
    cargarEjerciciosParaDiario();
  } else {
    diCargados = false;
    diarios = [];
    cerrarDiaDi();
  }
}

// Se llama al entrar a la página de Diario (desde mostrarSeccion)
function entrarDiario() {
  const ahora = new Date();
  diMes = ahora.getMonth(); // siempre abre en el mes actual
  diAnio = ahora.getFullYear();
  diDia = null;
  diDiaPanel.hidden = true;
  cerrarFormDi();
  panelDi.hidden = false;
  dibujarCalendarioDi();
  actualizarPanelDiario();
}
// Diario ya es una página: aquí solo se cierran el formulario y el submenú del día
function cerrarDiario() {
  cerrarEjerciciosDi();
  cerrarFormDi();
  diDiaPanel.hidden = true;
  diDia = null;
}

diEl("di-cerrar").addEventListener("click", cerrarDiario);
diEl("di-actualizar").addEventListener("click", () => {
  if (sesionVigente()) {
    cargarDiarios();
    cargarEjercicios(); // también vuelve a leer los ejercicios
  } else actualizarPanelDiario();
});
diEl("di-ir-login").addEventListener("click", () => {
  cerrarDiario();
  abrirLateral();
});
diAnterior.addEventListener("click", () => diCambiarMes(-1));
diSiguiente.addEventListener("click", () => diCambiarMes(1));
diEl("di-hoy").addEventListener("click", () => {
  const ahora = new Date();
  diMes = ahora.getMonth();
  diAnio = ahora.getFullYear();
  dibujarCalendarioDi();
});
diSelMes.addEventListener("change", () => { diMes = Number(diSelMes.value); dibujarCalendarioDi(); });
diSelAnio.addEventListener("change", () => { diAnio = Number(diSelAnio.value); dibujarCalendarioDi(); });
diEl("di-dia-volver").addEventListener("click", cerrarDiaDi);
diGuardar.addEventListener("click", guardarDi);
diEl("di-cancelar").addEventListener("click", cerrarFormDi);
diBorrar.addEventListener("click", borrarDi);
diEl("di-ej-volver").addEventListener("click", cerrarEjerciciosDi);
diEl("di-ej-detalle-cerrar").addEventListener("click", cerrarDetalleEjDi);
// Tocar el fondo oscuro (fuera de la ventana) cierra la información del ejercicio
diEjDetalle.addEventListener("click", (e) => {
  if (e.target === diEjDetalle) cerrarDetalleEjDi();
});
// Esc cierra primero la información del ejercicio, luego sus cuadros, la ventana y por último el submenú del día
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || panelDi.hidden) return;
  if (!diEjDetalle.hidden) cerrarDetalleEjDi();
  else if (!diEjSub.hidden) cerrarEjerciciosDi();
  else if (!diForm.hidden) cerrarFormDi();
  else if (!diDiaPanel.hidden) cerrarDiaDi();
});

// ---------- Deudas (hoja «Diario», columnas H a J) ----------
// Notas aparte, sin fecha: cada una guarda Nombre | Descripcion | Id en las columnas H, I y J de la hoja «Diario».
const deEl = (id) => document.getElementById(id);
const panelDe = deEl("panel-deudas");
const deSinSesion = deEl("de-sin-sesion");
const deContenido = deEl("de-contenido");
const deEstado = deEl("de-estado");
const deChips = deEl("de-chips");
const deForm = deEl("de-form");
const deFormTitulo = deEl("de-form-titulo");
const deNombre = deEl("de-nombre");
const deDescripcion = deEl("de-descripcion");
const deGuardar = deEl("de-guardar");
const deBorrar = deEl("de-borrar");
const deFormEstado = deEl("de-form-estado");

let deudas = []; // [{ id, nombre, descripcion }]
let deCargadas = false;
let deEditando = null; // deuda abierta en la ventana (null = deuda nueva)

function dibujarChipsDe() {
  deChips.innerHTML = "";
  deudas.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip ej-chip-resumen";
    b.title = d.nombre;
    b.setAttribute("aria-label", "Ver o editar la deuda " + d.nombre);
    const n = document.createElement("span");
    n.className = "ej-chip-nombre";
    n.textContent = "💸 " + d.nombre;
    const t = document.createElement("span");
    t.className = "ej-chip-desc";
    t.textContent = resumenCorto(d.descripcion, 70);
    b.append(n, t);
    b.addEventListener("click", () => abrirFormDe(d));
    deChips.appendChild(b);
  });
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "ej-chip ej-chip-nuevo";
  nuevo.setAttribute("aria-label", "Añadir una deuda");
  nuevo.innerHTML = '<span class="ej-chip-icono" aria-hidden="true">+</span><span class="ej-chip-nombre">Añadir</span>';
  nuevo.addEventListener("click", () => abrirFormDe(null));
  deChips.appendChild(nuevo);
}

// ----- Ventana para añadir / editar -----
function abrirFormDe(d) {
  deEditando = d;
  deFormTitulo.textContent = d ? "Editar deuda" : "Nueva deuda";
  deNombre.value = d ? d.nombre : "";
  deDescripcion.value = d ? d.descripcion : "";
  deBorrar.hidden = !d;
  setEstado(deFormEstado, "");
  deForm.hidden = false;
  deNombre.focus();
}
function cerrarFormDe() {
  deForm.hidden = true;
  deEditando = null;
}

async function guardarDe() {
  const nombre = deNombre.value.trim();
  if (!nombre) {
    setEstado(deFormEstado, "Escribe el nombre de la deuda", "error");
    return;
  }
  const editando = deEditando;
  const id = editando ? editando.id : String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const d = { id, nombre, descripcion: deDescripcion.value.trim() };
  deGuardar.disabled = true;
  setEstado(deFormEstado, "Guardando…");
  try {
    await llamarNotas(editando ? "deuda_editar" : "deuda_agregar", d);
    if (editando) deudas = deudas.map((x) => (x.id === id ? d : x));
    else deudas.push(d);
    cerrarFormDe();
    dibujarChipsDe();
  } catch (err) {
    setEstado(deFormEstado, "Error: " + err.message, "error");
  } finally {
    deGuardar.disabled = false;
  }
}

async function borrarDe() {
  const d = deEditando;
  if (!d || !window.confirm("¿Eliminar la deuda «" + d.nombre + "»?")) return;
  deBorrar.disabled = true;
  setEstado(deFormEstado, "Eliminando…");
  try {
    await llamarNotas("deuda_borrar", { id: d.id });
    deudas = deudas.filter((x) => x.id !== d.id);
    cerrarFormDe();
    dibujarChipsDe();
  } catch (err) {
    setEstado(deFormEstado, "Error: " + err.message, "error");
  } finally {
    deBorrar.disabled = false;
  }
}

// ----- Carga y sesión -----
async function cargarDeudas() {
  setEstado(deEstado, "Cargando…");
  try {
    const j = await llamarNotas("deuda_listar");
    deudas = Array.isArray(j.deudas) ? j.deudas : [];
    deCargadas = true;
    setEstado(deEstado, "");
    dibujarChipsDe();
  } catch (err) {
    setEstado(deEstado, "Error: " + err.message, "error");
  }
}

function actualizarPanelDeudas() {
  if (!sesionVigente()) {
    // Sin sesión no se guardan datos en pantalla
    deCargadas = false;
    deudas = [];
  }
  if (panelDe.hidden) return;
  const dentro = sesionVigente();
  deSinSesion.hidden = dentro;
  deContenido.hidden = !dentro;
  if (dentro) {
    if (!deCargadas) cargarDeudas();
    else dibujarChipsDe();
  } else {
    cerrarFormDe();
    dibujarChipsDe();
  }
}

// Se llama al entrar a la página de Deudas (desde mostrarSeccion)
function entrarDeudas() {
  cerrarFormDe();
  panelDe.hidden = false;
  dibujarChipsDe();
  actualizarPanelDeudas();
}
// Deudas es una página: aquí solo se cierra la ventana
function cerrarDeudas() {
  cerrarFormDe();
}

deEl("de-cerrar").addEventListener("click", cerrarDeudas);
deEl("de-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarDeudas();
  else actualizarPanelDeudas();
});
deEl("de-ir-login").addEventListener("click", () => {
  cerrarDeudas();
  abrirLateral();
});
deGuardar.addEventListener("click", guardarDe);
deEl("de-cancelar").addEventListener("click", cerrarFormDe);
deBorrar.addEventListener("click", borrarDe);
// Esc cierra la ventana de la deuda
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || panelDe.hidden) return;
  if (!deForm.hidden) cerrarFormDe();
});

// ---------- Información Primordial (hoja «Informacion Primordial») ----------
// Notas con Nombre | Fecha | Descripcion | Id (la Id de la columna D se llena sola).
const ipEl = (id) => document.getElementById(id);
const panelIp = ipEl("panel-informacion");
const ipSinSesion = ipEl("ip-sin-sesion");
const ipContenido = ipEl("ip-contenido");
const ipEstado = ipEl("ip-estado");
const ipChips = ipEl("ip-chips");
const ipForm = ipEl("ip-form");
const ipFormTitulo = ipEl("ip-form-titulo");
const ipNombre = ipEl("ip-nombre");
const ipFecha = ipEl("ip-fecha");
const ipDescripcion = ipEl("ip-descripcion");
const ipContador = ipEl("ip-contador");
const IP_LIMITE = 50000; // máximo de caracteres por celda de Google Sheets
// Contador de caracteres de la descripción; avisa cuando queda poco espacio
function ipActualizarContador() {
  const largo = ipDescripcion.value.length;
  const resta = Math.max(0, IP_LIMITE - largo);
  ipContador.textContent = largo.toLocaleString("es-MX") + " / " + IP_LIMITE.toLocaleString("es-MX") + " caracteres" +
    (largo >= 45000 ? (resta === 0 ? " — límite alcanzado" : " — queda poco espacio (" + resta.toLocaleString("es-MX") + ")") : "");
  ipContador.className = "nt-contador" + (largo >= 49000 ? " nt-contador-error" : largo >= 45000 ? " nt-contador-aviso" : "");
}
ipDescripcion.addEventListener("input", ipActualizarContador);
const ipGuardar = ipEl("ip-guardar");
const ipBorrar = ipEl("ip-borrar");
const ipFormEstado = ipEl("ip-form-estado");

let informaciones = []; // [{ id, nombre, fecha, descripcion }]
let ipCargadas = false;
let ipEditando = null; // nota abierta en la ventana (null = nota nueva)

// Fecha de hoy como "aaaa-mm-dd" (formato del campo de fecha y de la hoja)
function ipHoy() {
  const n = new Date();
  return `${n.getFullYear()}-${dos(n.getMonth() + 1)}-${dos(n.getDate())}`;
}
// "aaaa-mm-dd" -> "dd/mm/aaaa" para mostrarla
function ipFechaCorta(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function dibujarChipsIp() {
  ipChips.innerHTML = "";
  informaciones.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip ej-chip-resumen";
    b.title = d.nombre + (d.fecha ? " (" + ipFechaCorta(d.fecha) + ")" : "");
    b.setAttribute("aria-label", "Ver o editar la información " + d.nombre);
    const n = document.createElement("span");
    n.className = "ej-chip-nombre";
    n.textContent = "⭐ " + d.nombre;
    const f = document.createElement("span");
    f.className = "ej-chip-fecha";
    f.textContent = ipFechaCorta(d.fecha);
    const t = document.createElement("span");
    t.className = "ej-chip-desc";
    t.textContent = resumenCorto(d.descripcion, 70);
    b.append(n, f, t);
    b.addEventListener("click", () => abrirFormIp(d));
    ipChips.appendChild(b);
  });
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "ej-chip ej-chip-nuevo";
  nuevo.setAttribute("aria-label", "Añadir información primordial");
  nuevo.innerHTML = '<span class="ej-chip-icono" aria-hidden="true">+</span><span class="ej-chip-nombre">Añadir</span>';
  nuevo.addEventListener("click", () => abrirFormIp(null));
  ipChips.appendChild(nuevo);
}

// ----- Ventana para añadir / editar -----
function abrirFormIp(d) {
  ipEditando = d;
  ipFormTitulo.textContent = d ? "Editar información" : "Nueva información";
  ipNombre.value = d ? d.nombre : "";
  ipFecha.value = d && d.fecha ? d.fecha : ipHoy(); // si es nueva, empieza con la fecha de hoy
  ipDescripcion.value = d ? d.descripcion : "";
  ipActualizarContador();
  ipBorrar.hidden = !d;
  setEstado(ipFormEstado, "");
  ipForm.hidden = false;
  ipNombre.focus();
}
function cerrarFormIp() {
  ipForm.hidden = true;
  ipEditando = null;
}

async function guardarIp() {
  const nombre = ipNombre.value.trim();
  if (!nombre) {
    setEstado(ipFormEstado, "Escribe el nombre", "error");
    return;
  }
  const fecha = ipFecha.value || ipHoy();
  const editando = ipEditando;
  const id = editando ? editando.id : String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const d = { id, nombre, fecha, descripcion: ipDescripcion.value.trim() };
  ipGuardar.disabled = true;
  setEstado(ipFormEstado, "Guardando…");
  try {
    await llamarNotas(editando ? "informacion_editar" : "informacion_agregar", d);
    if (editando) informaciones = informaciones.map((x) => (x.id === id ? d : x));
    else informaciones.push(d);
    cerrarFormIp();
    dibujarChipsIp();
  } catch (err) {
    setEstado(ipFormEstado, "Error: " + err.message, "error");
  } finally {
    ipGuardar.disabled = false;
  }
}

async function borrarIp() {
  const d = ipEditando;
  if (!d || !window.confirm("¿Eliminar «" + d.nombre + "»?")) return;
  ipBorrar.disabled = true;
  setEstado(ipFormEstado, "Eliminando…");
  try {
    await llamarNotas("informacion_borrar", { id: d.id });
    informaciones = informaciones.filter((x) => x.id !== d.id);
    cerrarFormIp();
    dibujarChipsIp();
  } catch (err) {
    setEstado(ipFormEstado, "Error: " + err.message, "error");
  } finally {
    ipBorrar.disabled = false;
  }
}

// ----- Carga y sesión -----
async function cargarInformaciones() {
  setEstado(ipEstado, "Cargando…");
  try {
    const j = await llamarNotas("informacion_listar");
    informaciones = Array.isArray(j.informaciones) ? j.informaciones : [];
    ipCargadas = true;
    setEstado(ipEstado, "");
    dibujarChipsIp();
  } catch (err) {
    setEstado(ipEstado, "Error: " + err.message, "error");
  }
}

function actualizarPanelInformacion() {
  if (!sesionVigente()) {
    // Sin sesión no se guardan datos en pantalla
    ipCargadas = false;
    informaciones = [];
  }
  if (panelIp.hidden) return;
  const dentro = sesionVigente();
  ipSinSesion.hidden = dentro;
  ipContenido.hidden = !dentro;
  if (dentro) {
    if (!ipCargadas) cargarInformaciones();
    else dibujarChipsIp();
  } else {
    cerrarFormIp();
    dibujarChipsIp();
  }
}

// Se llama al entrar a la página de Información Primordial (desde mostrarSeccion)
function entrarInformacion() {
  cerrarFormIp();
  panelIp.hidden = false;
  dibujarChipsIp();
  actualizarPanelInformacion();
}
// Información Primordial es una página: aquí solo se cierra la ventana
function cerrarInformacion() {
  cerrarFormIp();
}

ipEl("ip-cerrar").addEventListener("click", cerrarInformacion);
ipEl("ip-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarInformaciones();
  else actualizarPanelInformacion();
});
ipEl("ip-ir-login").addEventListener("click", () => {
  cerrarInformacion();
  abrirLateral();
});
ipGuardar.addEventListener("click", guardarIp);
ipEl("ip-cancelar").addEventListener("click", cerrarFormIp);
ipBorrar.addEventListener("click", borrarIp);
// Esc cierra la ventana
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || panelIp.hidden) return;
  if (!ipForm.hidden) cerrarFormIp();
});

// ---------- Comandos (hoja «comandos») ----------
// Notas con Nombre | Fecha | Descripcion | Id (la Id de la columna D se llena sola).
const cmEl = (id) => document.getElementById(id);
const panelCm = cmEl("panel-comandos");
const cmSinSesion = cmEl("cm-sin-sesion");
const cmContenido = cmEl("cm-contenido");
const cmEstado = cmEl("cm-estado");
const cmChips = cmEl("cm-chips");
const cmForm = cmEl("cm-form");
const cmFormTitulo = cmEl("cm-form-titulo");
const cmNombre = cmEl("cm-nombre");
const cmFecha = cmEl("cm-fecha");
const cmDescripcion = cmEl("cm-descripcion");
const cmGuardar = cmEl("cm-guardar");
const cmBorrar = cmEl("cm-borrar");
const cmFormEstado = cmEl("cm-form-estado");

let comandosLista = []; // [{ id, nombre, fecha, descripcion }]
let cmCargadas = false;
let cmEditando = null; // nota abierta en la ventana (null = nota nueva)

// Fecha de hoy como "aaaa-mm-dd" (formato del campo de fecha y de la hoja)
function cmHoy() {
  const n = new Date();
  return `${n.getFullYear()}-${dos(n.getMonth() + 1)}-${dos(n.getDate())}`;
}
// "aaaa-mm-dd" -> "dd/mm/aaaa" para mostrarla
function cmFechaCorta(f) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f || "");
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

function dibujarChipsCm() {
  cmChips.innerHTML = "";
  comandosLista.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip ej-chcm-resumen";
    b.title = d.nombre + (d.fecha ? " (" + cmFechaCorta(d.fecha) + ")" : "");
    b.setAttribute("aria-label", "Ver o editar el comando " + d.nombre);
    const n = document.createElement("span");
    n.className = "ej-chcm-nombre";
    n.textContent = "🎙️ " + d.nombre;
    const f = document.createElement("span");
    f.className = "ej-chcm-fecha";
    f.textContent = cmFechaCorta(d.fecha);
    const t = document.createElement("span");
    t.className = "ej-chcm-desc";
    t.textContent = resumenCorto(d.descripcion, 70);
    b.append(n, f, t);
    b.addEventListener("click", () => abrirFormCm(d));
    cmChips.appendChild(b);
  });
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "ej-chip ej-chcm-nuevo";
  nuevo.setAttribute("aria-label", "Añadir un comando");
  nuevo.innerHTML = '<span class="ej-chcm-icono" aria-hidden="true">+</span><span class="ej-chcm-nombre">Añadir</span>';
  nuevo.addEventListener("click", () => abrirFormCm(null));
  cmChips.appendChild(nuevo);
}

// ----- Ventana para añadir / editar -----
function abrirFormCm(d) {
  cmEditando = d;
  cmFormTitulo.textContent = d ? "Editar comando" : "Nuevo comando";
  cmNombre.value = d ? d.nombre : "";
  cmFecha.value = d && d.fecha ? d.fecha : cmHoy(); // si es nueva, empieza con la fecha de hoy
  cmDescripcion.value = d ? d.descripcion : "";
  cmBorrar.hidden = !d;
  setEstado(cmFormEstado, "");
  cmForm.hidden = false;
  cmNombre.focus();
}
function cerrarFormCm() {
  cmForm.hidden = true;
  cmEditando = null;
}

async function guardarCm() {
  const nombre = cmNombre.value.trim();
  if (!nombre) {
    setEstado(cmFormEstado, "Escribe el nombre", "error");
    return;
  }
  const fecha = cmFecha.value || cmHoy();
  const editando = cmEditando;
  const id = editando ? editando.id : String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const d = { id, nombre, fecha, descripcion: cmDescripcion.value.trim() };
  cmGuardar.disabled = true;
  setEstado(cmFormEstado, "Guardando…");
  try {
    await llamarNotas(editando ? "comando_editar" : "comando_agregar", d);
    if (editando) comandosLista = comandosLista.map((x) => (x.id === id ? d : x));
    else comandosLista.push(d);
    cerrarFormCm();
    dibujarChipsCm();
  } catch (err) {
    setEstado(cmFormEstado, "Error: " + err.message, "error");
  } finally {
    cmGuardar.disabled = false;
  }
}

async function borrarCm() {
  const d = cmEditando;
  if (!d || !window.confirm("¿Eliminar «" + d.nombre + "»?")) return;
  cmBorrar.disabled = true;
  setEstado(cmFormEstado, "Eliminando…");
  try {
    await llamarNotas("comando_borrar", { id: d.id });
    comandosLista = comandosLista.filter((x) => x.id !== d.id);
    cerrarFormCm();
    dibujarChipsCm();
  } catch (err) {
    setEstado(cmFormEstado, "Error: " + err.message, "error");
  } finally {
    cmBorrar.disabled = false;
  }
}

// ----- Carga y sesión -----
async function cargarComandos() {
  setEstado(cmEstado, "Cargando…");
  try {
    const j = await llamarNotas("comando_listar");
    comandosLista = Array.isArray(j.comandosLista) ? j.comandosLista : [];
    cmCargadas = true;
    setEstado(cmEstado, "");
    dibujarChipsCm();
  } catch (err) {
    setEstado(cmEstado, "Error: " + err.message, "error");
  }
}

function actualizarPanelComandos() {
  if (!sesionVigente()) {
    // Sin sesión no se guardan datos en pantalla
    cmCargadas = false;
    comandosLista = [];
  }
  if (panelCm.hidden) return;
  const dentro = sesionVigente();
  cmSinSesion.hidden = dentro;
  cmContenido.hidden = !dentro;
  if (dentro) {
    if (!cmCargadas) cargarComandos();
    else dibujarChipsCm();
  } else {
    cerrarFormCm();
    dibujarChipsCm();
  }
}

// Se llama al entrar a la página de Comandos (desde mostrarSeccion)
function entrarComandos() {
  cerrarFormCm();
  panelCm.hidden = false;
  dibujarChipsCm();
  actualizarPanelComandos();
}
// Comandos es una página: aquí solo se cierra la ventana
function cerrarComandos() {
  cerrarFormCm();
}

cmEl("cm-cerrar").addEventListener("click", cerrarComandos);
cmEl("cm-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarComandos();
  else actualizarPanelComandos();
});
cmEl("cm-ir-login").addEventListener("click", () => {
  cerrarComandos();
  abrirLateral();
});
cmGuardar.addEventListener("click", guardarCm);
cmEl("cm-cancelar").addEventListener("click", cerrarFormCm);
cmBorrar.addEventListener("click", borrarCm);
// Esc cierra la ventana
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || panelCm.hidden) return;
  if (!cmForm.hidden) cerrarFormCm();
});

// ---------- Bazar (hoja «Bazar») ----------
// Registros con Nombre | Informacion | Id (la Id de la columna C se llena sola).
const bzEl = (id) => document.getElementById(id);
const panelBz = bzEl("panel-bazar");
const bzSinSesion = bzEl("bz-sin-sesion");
const bzContenido = bzEl("bz-contenido");
const bzEstado = bzEl("bz-estado");
const bzChips = bzEl("bz-chips");
const bzForm = bzEl("bz-form");
const bzFormTitulo = bzEl("bz-form-titulo");
const bzNombre = bzEl("bz-nombre");
const bzInformacion = bzEl("bz-informacion");
const bzGuardar = bzEl("bz-guardar");
const bzBorrar = bzEl("bz-borrar");
const bzFormEstado = bzEl("bz-form-estado");

let bazarLista = []; // [{ id, nombre, informacion }]
let bzCargadas = false;
let bzEditando = null; // registro abierto en la ventana (null = registro nuevo)

function dibujarChipsBz() {
  bzChips.innerHTML = "";
  bazarLista.forEach((d) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip ej-chip-resumen";
    b.title = d.nombre;
    b.setAttribute("aria-label", "Ver o editar el registro " + d.nombre);
    const n = document.createElement("span");
    n.className = "ej-chip-nombre";
    n.textContent = d.nombre;
    const t = document.createElement("span");
    t.className = "ej-chip-desc";
    t.textContent = resumenCorto(d.informacion, 70);
    b.append(n, t);
    b.addEventListener("click", () => abrirFormBz(d));
    bzChips.appendChild(b);
  });
  const nuevo = document.createElement("button");
  nuevo.type = "button";
  nuevo.className = "ej-chip ej-chip-nuevo";
  nuevo.setAttribute("aria-label", "Añadir un registro al bazar");
  nuevo.innerHTML = '<span class="ej-chip-icono" aria-hidden="true">+</span><span class="ej-chip-nombre">Añadir</span>';
  nuevo.addEventListener("click", () => abrirFormBz(null));
  bzChips.appendChild(nuevo);
}

// ----- Ventana para añadir / editar -----
function abrirFormBz(d) {
  bzEditando = d;
  bzFormTitulo.textContent = d ? "Editar registro" : "Nuevo registro";
  bzNombre.value = d ? d.nombre : "";
  bzInformacion.value = d ? d.informacion : "";
  bzBorrar.hidden = !d;
  setEstado(bzFormEstado, "");
  bzForm.hidden = false;
  bzNombre.focus();
}
function cerrarFormBz() {
  bzForm.hidden = true;
  bzEditando = null;
}

async function guardarBz() {
  const nombre = bzNombre.value.trim();
  if (!nombre) {
    setEstado(bzFormEstado, "Escribe el nombre", "error");
    return;
  }
  const editando = bzEditando;
  const id = editando ? editando.id : String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
  const d = { id, nombre, informacion: bzInformacion.value.trim() };
  bzGuardar.disabled = true;
  setEstado(bzFormEstado, "Guardando…");
  try {
    await llamarNotas(editando ? "bazar_editar" : "bazar_agregar", d);
    if (editando) bazarLista = bazarLista.map((x) => (x.id === id ? d : x));
    else bazarLista.push(d);
    cerrarFormBz();
    dibujarChipsBz();
  } catch (err) {
    setEstado(bzFormEstado, "Error: " + err.message, "error");
  } finally {
    bzGuardar.disabled = false;
  }
}

async function borrarBz() {
  const d = bzEditando;
  if (!d || !window.confirm("¿Eliminar «" + d.nombre + "»?")) return;
  bzBorrar.disabled = true;
  setEstado(bzFormEstado, "Eliminando…");
  try {
    await llamarNotas("bazar_borrar", { id: d.id });
    bazarLista = bazarLista.filter((x) => x.id !== d.id);
    cerrarFormBz();
    dibujarChipsBz();
  } catch (err) {
    setEstado(bzFormEstado, "Error: " + err.message, "error");
  } finally {
    bzBorrar.disabled = false;
  }
}

// ----- Carga y sesión -----
async function cargarBazar() {
  setEstado(bzEstado, "Cargando…");
  try {
    const j = await llamarNotas("bazar_listar");
    bazarLista = Array.isArray(j.bazarLista) ? j.bazarLista : [];
    bzCargadas = true;
    setEstado(bzEstado, "");
    dibujarChipsBz();
  } catch (err) {
    setEstado(bzEstado, "Error: " + err.message, "error");
  }
}

function actualizarPanelBazar() {
  if (!sesionVigente()) {
    // Sin sesión no se guardan datos en pantalla
    bzCargadas = false;
    bazarLista = [];
  }
  if (panelBz.hidden) return;
  const dentro = sesionVigente();
  bzSinSesion.hidden = dentro;
  bzContenido.hidden = !dentro;
  if (dentro) {
    if (!bzCargadas) cargarBazar();
    else dibujarChipsBz();
  } else {
    cerrarFormBz();
    dibujarChipsBz();
  }
}

// Se llama al entrar a la página de Bazar (desde mostrarSeccion)
function entrarBazar() {
  cerrarFormBz();
  panelBz.hidden = false;
  dibujarChipsBz();
  actualizarPanelBazar();
}
// Bazar es una página: aquí solo se cierra la ventana
function cerrarBazar() {
  cerrarFormBz();
}

bzEl("bz-cerrar").addEventListener("click", cerrarBazar);
bzEl("bz-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarBazar();
  else actualizarPanelBazar();
});
bzEl("bz-ir-login").addEventListener("click", () => {
  cerrarBazar();
  abrirLateral();
});
bzGuardar.addEventListener("click", guardarBz);
bzEl("bz-cancelar").addEventListener("click", cerrarFormBz);
bzBorrar.addEventListener("click", borrarBz);
// Esc cierra la ventana
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || panelBz.hidden) return;
  if (!bzForm.hidden) cerrarFormBz();
});

// ---------- Día de Hoy ----------
// No tiene hoja propia: junta lo que tenga la fecha de hoy en las demás zonas (Calendario, Notas, Ejercicio,
// Actividades, Trabajo, Diario, Información Primordial, Comandos y Pedidos de Yeso). Deudas y Bazar no
// guardan fecha, así que no aparecen aquí.
const hyEl = (id) => document.getElementById(id);
const seccionHy = hyEl("seccion-hoy");
const panelHy = hyEl("panel-hoy");
const hySinSesion = hyEl("hy-sin-sesion");
const hyContenido = hyEl("hy-contenido");
const hyEstado = hyEl("hy-estado");
const hyFecha = hyEl("hy-fecha");
const hyGruposEl = hyEl("hy-grupos");
const hyDetalle = hyEl("hy-detalle");
const hyDetalleIr = hyEl("hy-detalle-ir");

// Zonas que se revisan, en el orden del menú; «seccion» es la página que se abre desde el detalle
const HY_ZONAS = [
  { id: "calendario", icono: "📅", titulo: "Calendario", seccion: "calendario" },
  { id: "notas", icono: "📝", titulo: "Notas", seccion: "seccion-notas" },
  { id: "ejercicio", icono: "💪", titulo: "Ejercicio", seccion: "seccion-ejercicio" },
  { id: "actividades", icono: "🎯", titulo: "Actividades", seccion: "actividades" },
  { id: "trabajo", icono: "💼", titulo: "Trabajo", seccion: "trabajo" },
  { id: "diario", icono: "📓", titulo: "Diario", seccion: "seccion-diario" },
  { id: "informacion", icono: "⭐", titulo: "Información Primordial", seccion: "seccion-informacion" },
  { id: "comandos", icono: "🎙️", titulo: "Comandos", seccion: "seccion-comandos" },
  { id: "yeso", icono: "📦", titulo: "Pedidos de Yeso", seccion: "pedidos-yeso" },
];

let hyGrupos = []; // [{ zona, items: [{ nombre, hora, texto, extra }] }]
let hyCargadas = false;
let hyCargando = false;
let hyPeticion = 0; // sirve para ignorar respuestas viejas si se vuelve a pedir
let hyAbierta = null; // zona del recuadro que está abierto en el detalle
let hyItemAbierto = null; // recuadro que está abierto en el detalle

// Día de hoy como "aaaa-mm-dd" (misma forma en que lo guardan Ejercicio, Diario, Información y Comandos)
function hyClaveHoy() {
  const n = new Date();
  return `${n.getFullYear()}-${dos(n.getMonth() + 1)}-${dos(n.getDate())}`;
}
function hyFechaLarga() {
  const t = new Date().toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}
// Fecha de una nota «dd/mm/aaaa hh:mm» -> { dia: "aaaa-mm-dd", hora: "hh:mm" } (o null si no se entiende)
function hyDeNota(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2}))?/.exec(String(s || "").trim());
  if (!m) return null;
  return { dia: `${m[3]}-${dos(m[2])}-${dos(m[1])}`, hora: m[4] ? `${dos(m[4])}:${m[5]}` : "" };
}
// Los textos del calendario empiezan con una línea «dd/mm/aaaa hh:mm»: se separa la hora del texto
function hySinSello(t) {
  const m = /^\d{1,2}\/\d{1,2}\/\d{4} (\d{1,2}:\d{2})[ \t]*\r?\n([\s\S]*)$/.exec(String(t || "").trim());
  return m ? { hora: m[1].padStart(5, "0"), texto: m[2].trim() } : { hora: "", texto: String(t || "").trim() };
}

// Arma los grupos con lo que tenga la fecha de hoy. Si una zona no se pudo leer llega null y se salta.
function hyArmar(clave, f) {
  const por = {};
  HY_ZONAS.forEach((z) => (por[z.id] = []));

  // Calendario: Descripción (una sola), Actividades y Anotaciones (cada recuadro por separado)
  const dia = f.calendario ? f.calendario[clave] : null;
  if (dia) {
    CAMPOS.forEach((campo) => {
      const crudo = dia[campo.clave];
      const elementos = parsearElementos(crudo)
        .map((t, i) => Object.assign(hySinSello(t), { i }))
        .filter((e) => e.texto);
      if (!elementos.length) return;
      if (campo.clave === "descripcion") {
        por.calendario.push({
          nombre: campo.etiqueta,
          hora: elementos[0].hora,
          texto: elementos.map((e) => e.texto).join("\n\n"),
          origen: { tipo: "calendario", fecha: clave, campo: campo.clave, todo: true },
        });
      } else {
        elementos.forEach((e) =>
          por.calendario.push({
            nombre: campo.etiqueta,
            hora: e.hora,
            texto: e.texto,
            origen: { tipo: "calendario", fecha: clave, campo: campo.clave, indice: e.i, crudo },
          })
        );
      }
    });
  }

  // Notas: según su etiqueta pertenecen a Actividades, Trabajo, Pedidos de Yeso o a Notas
  (f.notas || []).forEach((n) => {
    const fn = hyDeNota(n.fecha);
    if (!fn || fn.dia !== clave) return;
    const zona = n.etiqueta === "Actividades" ? "actividades"
      : n.etiqueta === "Trabajo" ? "trabajo"
      : n.etiqueta === "Pedidos de Yeso" ? "yeso"
      : "notas";
    por[zona].push({
      nombre: n.nombre || "Sin nombre",
      hora: fn.hora,
      texto: n.texto,
      extra: zona === "notas" ? n.etiqueta : "",
      origen: { tipo: "nota", id: n.id },
    });
  });

  (f.ejercicios || []).forEach((e) => {
    if (e.fecha === clave) {
      por.ejercicio.push({ nombre: e.nombre, hora: "", texto: e.descripcion, origen: { tipo: "ejercicio", id: e.id } });
    }
  });
  (f.diarios || []).forEach((d) => {
    if (d.fecha === clave) {
      por.diario.push({
        nombre: d.nombre,
        hora: "",
        marca: d.marca === "Tarea finalizada" ? "✅ Tarea finalizada" : d.terminado ? "✅ Terminado" : "",
        texto: d.descripcion,
        extra: d.marca === "Tarea finalizada" ? "Anotación de Tarea Finalizada" : d.terminado ? "Trabajo terminado" : "",
        finalizada: d.marca === "Tarea finalizada",
      });
    }
  });
  (f.informaciones || []).forEach((i) => {
    if (i.fecha === clave) {
      por.informacion.push({ nombre: i.nombre, hora: "", texto: i.descripcion, origen: { tipo: "informacion", id: i.id } });
    }
  });
  (f.comandos || []).forEach((c) => {
    if (c.fecha === clave) {
      por.comandos.push({ nombre: c.nombre, hora: "", texto: c.descripcion, origen: { tipo: "comando", id: c.id } });
    }
  });

  return HY_ZONAS.map((zona) => {
    // Los que tienen hora van por hora; los demás se quedan en el orden de la hoja
    const items = por[zona.id].sort((x, y) => (x.hora || "99:99").localeCompare(y.hora || "99:99"));
    return { zona, items };
  });
}

// Un grupo de recuadros (título de la zona + sus recuadros)
function hyCrearGrupo(g) {
  const sec = document.createElement("section");
  sec.className = "hoy-grupo";
  const titulo = document.createElement("h3");
  titulo.className = "notas-grupo-titulo";
  titulo.textContent = g.zona.icono + " " + g.zona.titulo;
  const cuenta = document.createElement("span");
  cuenta.className = "notas-grupo-cuenta";
  cuenta.textContent = String(g.items.length);
  titulo.appendChild(cuenta);
  const chips = document.createElement("div");
  chips.className = "ej-chips";
  g.items.forEach((it) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ej-chip ej-chip-resumen" + (it.finalizada ? " ej-chip-finalizada" : "");
    b.title = it.nombre + (it.hora ? " (" + it.hora + ")" : "");
    b.setAttribute("aria-label", "Ver " + it.nombre + " de " + g.zona.titulo);
    const n = document.createElement("span");
    n.className = "ej-chip-nombre";
    n.textContent = it.nombre;
    const t = document.createElement("span");
    t.className = "ej-chip-desc";
    t.textContent = resumenCorto(it.texto, 70);
    if (it.hora || it.marca) {
      const f = document.createElement("span");
      f.className = "ej-chip-fecha";
      f.textContent = it.hora || it.marca;
      b.append(n, f, t);
    } else {
      b.append(n, t);
    }
    b.addEventListener("click", () => abrirDetalleHy(g.zona, it));
    chips.appendChild(b);
  });
  sec.append(titulo, chips);
  return sec;
}

function dibujarHoy() {
  hyFecha.textContent = hyFechaLarga();
  hyGruposEl.innerHTML = "";
  if (!hyCargadas) return;
  const conAlgo = hyGrupos.filter((g) => g.items.length);
  if (!conAlgo.length) {
    const p = document.createElement("p");
    p.className = "notas-vacio";
    p.textContent = "No hay nada registrado con la fecha de hoy.";
    hyGruposEl.appendChild(p);
    return;
  }
  // El Diario va aparte: primero las demás zonas, y debajo de una línea los recuadros del Diario
  conAlgo.filter((g) => g.zona.id !== "diario").forEach((g) => hyGruposEl.appendChild(hyCrearGrupo(g)));
  const diario = conAlgo.find((g) => g.zona.id === "diario");
  if (diario) {
    const linea = document.createElement("hr");
    linea.className = "hoy-separador";
    hyGruposEl.append(linea, hyCrearGrupo(diario));
  }
}

// ----- Detalle de un recuadro (solo lectura) -----
function abrirDetalleHy(zona, it) {
  hyAbierta = zona;
  hyItemAbierto = it;
  hyEl("hy-detalle-fin").hidden = !it.origen; // lo del Diario ya está en el Diario
  hyEl("hy-detalle-fin").disabled = false;
  setEstado(hyEl("hy-detalle-estado"), "");
  hyEl("hy-detalle-nombre").textContent = it.nombre;
  hyEl("hy-detalle-origen").textContent =
    zona.icono + " " + zona.titulo + (it.extra ? " · " + it.extra : "") + (it.hora ? " · " + it.hora : "");
  hyEl("hy-detalle-texto").textContent = it.texto || "Sin descripción";
  hyDetalleIr.textContent = "Abrir " + zona.titulo;
  hyDetalle.hidden = false;
}
function cerrarDetalleHy() {
  hyDetalle.hidden = true;
  hyAbierta = null;
  hyItemAbierto = null;
}

// Nombre para el Diario cuando lo que se finaliza viene del Calendario (su recuadro solo se llama «Actividades», etc.)
function hyNombreDeTexto(texto, respaldo) {
  const linea = String(texto || "").split(/\r?\n/).map((x) => x.trim()).find((x) => x) || respaldo || "Tarea finalizada";
  return linea.length > 70 ? linea.slice(0, 69) + "…" : linea;
}

// «Dar por finalizado»: la nota se quita de donde estaba y pasa al Diario (con la fecha de hoy) como
// «Anotación de Tarea Finalizada». Primero se agrega al Diario y después se quita del origen; si algo falla
// a medias se puede volver a intentar sin que quede repetida (el Diario no repite un mismo Id).
async function finalizarHy() {
  const zona = hyAbierta;
  const it = hyItemAbierto;
  if (!zona || !it || !it.origen) return;
  const o = it.origen;
  const esCal = o.tipo === "calendario";
  const nombre = (esCal ? hyNombreDeTexto(it.texto, it.nombre) : it.nombre || "Sin nombre").slice(0, 80);
  if (!window.confirm("¿Dar por finalizado «" + nombre + "»? Se quitará de " + zona.titulo + " y pasará al Diario con la fecha de hoy.")) return;
  const boton = hyEl("hy-detalle-fin");
  const estado = hyEl("hy-detalle-estado");
  boton.disabled = true;
  setEstado(estado, "Finalizando…");
  const hoyClave = hyClaveHoy();
  const id = o.id || it.finId || (it.finId = String(Date.now() * 1000 + Math.floor(Math.random() * 1000)));
  const descripcion = String(it.texto || "").slice(0, 50000);
  try {
    // 1) Agregarla al Diario como tarea finalizada
    await llamarNotas("diario_agregar", { id, nombre, fecha: hoyClave, descripcion, terminado: "Tarea finalizada" });
    // 2) Quitarla de donde estaba
    if (o.tipo === "nota") {
      await llamarNotas("nota_borrar", { id: o.id });
      notas = notas.filter((n) => n.id !== o.id);
      if (notasCargadas) dibujarNotas();
    } else if (o.tipo === "ejercicio") {
      await llamarNotas("ejercicio_borrar", { id: o.id });
      ejCargados = false; // se vuelve a leer al entrar
    } else if (o.tipo === "informacion") {
      await llamarNotas("informacion_borrar", { id: o.id });
      ipCargadas = false;
    } else if (o.tipo === "comando") {
      await llamarNotas("comando_borrar", { id: o.id });
      cmCargadas = false;
    } else if (esCal) {
      let nuevo = "";
      if (!o.todo) {
        const elementos = parsearElementos(o.crudo);
        elementos.splice(o.indice, 1);
        nuevo = serializarElementos(elementos);
      }
      await guardarCampo(o.fecha, o.campo, nuevo);
      if (calendarioCargado) dibujarCalendario();
    }
    diCargados = false; // el Diario se vuelve a leer al entrar y ya trae la nueva anotación
    // 3) Actualizar esta página: sale de su grupo y aparece en el Diario, en verde
    const grupo = hyGrupos.find((g) => g.zona.id === zona.id);
    if (grupo) grupo.items = grupo.items.filter((x) => x !== it);
    let gd = hyGrupos.find((g) => g.zona.id === "diario");
    if (!gd) {
      gd = { zona: HY_ZONAS.find((z) => z.id === "diario"), items: [] };
      hyGrupos.push(gd);
    }
    gd.items.push({
      nombre,
      hora: "",
      marca: "✅ Tarea finalizada",
      texto: descripcion,
      extra: "Anotación de Tarea Finalizada",
      finalizada: true,
    });
    cerrarDetalleHy();
    dibujarHoy();
    setEstado(hyEstado, "Tarea finalizada ✓ (ya está en el Diario)", "ok");
  } catch (e) {
    boton.disabled = false;
    setEstado(estado, "Error: " + e.message + " — puedes volver a intentarlo", "error");
  }
}
// Lleva a la zona de donde viene el recuadro (para verlo completo o modificarlo)
function irAZonaHy() {
  const zona = hyAbierta;
  if (!zona) return;
  cerrarDetalleHy();
  mostrarSeccion(zona.seccion);
  // Actividades, Trabajo y Pedidos de Yeso arman su zona con las notas: se prepara igual que desde su botón
  const z = zonas.find((x) => x.cfg.seccion === zona.seccion);
  if (z) {
    if (z.actualizar() && !notasCargadas) cargarNotasZonas();
    else z.dibujar();
  }
}

// ----- Carga y sesión -----
// Pide a la vez los datos de todas las zonas con fecha; si alguna falla, se muestran las demás y se avisa cuál.
async function cargarHoy() {
  const peticion = ++hyPeticion;
  hyCargando = true;
  setEstado(hyEstado, "Cargando…");
  const clave = hyClaveHoy();
  const pedidos = [
    ["Calendario", "calendario_listar"],
    ["Notas", "nota_listar"],
    ["Ejercicio", "ejercicio_listar"],
    ["Diario", "diario_listar"],
    ["Información Primordial", "informacion_listar"],
    ["Comandos", "comando_listar"],
  ];
  const resultados = await Promise.allSettled(pedidos.map((p) => llamarNotas(p[1])));
  if (peticion !== hyPeticion) return; // llegó otra petición más nueva: esta ya no sirve
  hyCargando = false;
  if (!sesionVigente()) return; // se cerró la sesión mientras cargaba
  const fallaron = [];
  const dato = (i) => {
    const r = resultados[i];
    if (r.status === "fulfilled") return r.value;
    fallaron.push(pedidos[i][0]);
    return null;
  };
  const cal = dato(0), nts = dato(1), ejs = dato(2), dis = dato(3), ips = dato(4), cms = dato(5);
  hyGrupos = hyArmar(clave, {
    calendario: cal ? cal.datos : null,
    notas: nts ? nts.notas : null,
    ejercicios: ejs ? ejs.ejercicios : null,
    diarios: dis ? dis.diarios : null,
    informaciones: ips ? ips.informaciones : null,
    comandos: cms ? cms.comandosLista : null,
  });
  hyCargadas = true;
  if (fallaron.length) setEstado(hyEstado, "No se pudo leer: " + fallaron.join(", "), "error");
  else setEstado(hyEstado, "");
  dibujarHoy();
}

function actualizarPanelHoy() {
  if (!sesionVigente()) {
    // Sin sesión no se guardan datos en pantalla
    hyCargadas = false;
    hyGrupos = [];
  }
  if (panelHy.hidden || seccionHy.hidden) return;
  const dentro = sesionVigente();
  hySinSesion.hidden = dentro;
  hyContenido.hidden = !dentro;
  if (dentro) {
    if (!hyCargadas && !hyCargando) cargarHoy();
    else dibujarHoy();
  } else {
    cerrarDetalleHy();
    dibujarHoy();
  }
}

// Se llama al entrar a la página (desde mostrarSeccion): siempre vuelve a leer, porque «hoy» puede haber cambiado
function entrarHoy() {
  cerrarDetalleHy();
  panelHy.hidden = false;
  hyCargadas = false;
  dibujarHoy();
  actualizarPanelHoy();
}
// Día de Hoy es una página: aquí solo se cierra la ventana de detalle
function cerrarHoy() {
  cerrarDetalleHy();
}

hyEl("hy-cerrar").addEventListener("click", cerrarHoy);
hyEl("hy-actualizar").addEventListener("click", () => {
  if (sesionVigente()) cargarHoy();
  else actualizarPanelHoy();
});
hyEl("hy-ir-login").addEventListener("click", () => {
  cerrarHoy();
  abrirLateral();
});
hyEl("hy-detalle-cerrar").addEventListener("click", cerrarDetalleHy);
hyDetalleIr.addEventListener("click", irAZonaHy);
hyEl("hy-detalle-fin").addEventListener("click", finalizarHy);
hyDetalle.addEventListener("click", (e) => {
  if (e.target === hyDetalle) cerrarDetalleHy(); // tocar fuera de la ventana la cierra
});
// Esc cierra el detalle
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || hyDetalle.hidden) return;
  cerrarDetalleHy();
});

// ---------- Notario: una zona de notas dentro de una zona de notas ----------
// Un Notario tiene nombre y descripción, y guarda varias notas por separado dentro de UNA sola celda de
// la hoja «Notarios» (columna E). Google Sheets permite 50,000 caracteres por celda, así que cada Notario
// muestra un medidor y avisa cuando queda poco espacio; al llegar al límite ya no deja agregar más.
// Se puede crear desde cualquiera de estas zonas (la clave debe estar también en ZONAS_NOTARIO del Apps Script).
// El formato de la celda y las reglas de limpieza deben ser iguales a los del Apps Script.
const NT_LIMITE = 50000; // máximo de caracteres por celda de Google Sheets
const NT_AVISO = 45000; // desde aquí: «queda poco espacio» (90 %)
const NT_CRITICO = 49000; // desde aquí: «casi lleno» (98 %)
const NT_SEPARADOR = "\n~~~✂~~~\n";
const NT_MARCA = "~~~✂~~~";

var NT = { lista: [], cargados: false, cargando: false, montajes: [], abierto: null, zonaNueva: null, editandoNota: null };

const ntFmt = (n) => Number(n).toLocaleString("es-MX");
const ntLimpiar = (t) => String(t || "").split(NT_MARCA).join("~~✂~~").trim();
const ntNuevoId = () => String(Date.now() * 1000 + Math.floor(Math.random() * 1000));
// Largo EXACTO que tendrá la celda (con encabezados y separadores), tal como lo calcula el Apps Script
function ntLargo(notas) {
  return notas.map((n) => "#" + n.id + "|" + n.fecha + "\n" + n.texto).join(NT_SEPARADOR).length;
}
function ntNivel(largo) {
  return largo >= NT_CRITICO ? "critico" : largo >= NT_AVISO ? "aviso" : "ok";
}
const ntPorId = (id) => NT.lista.find((n) => n.id === id) || null;

// ----- Ventana del notario (una sola, compartida por todas las zonas) -----
const ntModal = document.createElement("div");
ntModal.className = "nt-modal";
ntModal.hidden = true;
ntModal.innerHTML = `
  <div class="nt-caja" role="dialog" aria-modal="true" aria-labelledby="nt-titulo">
    <div class="nt-cab">
      <h3 id="nt-titulo" class="nt-titulo">Nuevo notario</h3>
      <button type="button" class="nt-cerrar" aria-label="Cerrar" title="Cerrar">&times;</button>
    </div>
    <div class="nt-datos">
      <label class="nt-campo">
        <span>Nombre</span>
        <input class="nt-nombre" type="text" maxlength="80" placeholder="Nombre del notario" autocomplete="off" />
      </label>
      <label class="nt-campo">
        <span>Descripción</span>
        <textarea class="nt-desc" rows="3" maxlength="5000" placeholder="¿Para qué es este notario?"></textarea>
      </label>
      <div class="nt-fila">
        <button type="button" class="notas-btn nt-guardar-datos">Crear notario</button>
        <button type="button" class="notas-btn nt-borrar-notario" hidden>Eliminar notario</button>
        <span class="notas-estado nt-estado-datos"></span>
      </div>
    </div>
    <div class="nt-notas" hidden>
      <div class="nt-medidor nt-ok">
        <div class="nt-medidor-texto">
          <strong class="nt-uso"></strong>
          <span class="nt-resta"></span>
        </div>
        <div class="nt-medidor-barra"><i></i></div>
        <p class="nt-mensaje" hidden></p>
      </div>
      <div class="nt-nueva">
        <textarea class="nt-texto" rows="4" placeholder="Escribe una nota nueva…" aria-label="Nueva nota del notario"></textarea>
        <div class="nt-fila">
          <button type="button" class="notas-btn nt-agregar">Agregar nota</button>
          <span class="nt-contador"></span>
        </div>
        <span class="notas-estado nt-estado-nota"></span>
      </div>
      <h4 class="nt-lista-titulo"></h4>
      <div class="nt-lista"></div>
    </div>
  </div>`;
document.body.appendChild(ntModal);

const ntq = (s) => ntModal.querySelector(s);
const ntEl = {
  titulo: ntq(".nt-titulo"),
  nombre: ntq(".nt-nombre"),
  desc: ntq(".nt-desc"),
  guardarDatos: ntq(".nt-guardar-datos"),
  borrarNotario: ntq(".nt-borrar-notario"),
  estadoDatos: ntq(".nt-estado-datos"),
  notas: ntq(".nt-notas"),
  medidor: ntq(".nt-medidor"),
  uso: ntq(".nt-uso"),
  resta: ntq(".nt-resta"),
  barra: ntq(".nt-medidor-barra i"),
  aviso: ntq(".nt-mensaje"),
  texto: ntq(".nt-texto"),
  agregar: ntq(".nt-agregar"),
  contador: ntq(".nt-contador"),
  estadoNota: ntq(".nt-estado-nota"),
  listaTitulo: ntq(".nt-lista-titulo"),
  lista: ntq(".nt-lista"),
};

// Medidor de caracteres del notario abierto (con el aviso de poco espacio)
function ntDibujarMedidor(n) {
  const largo = ntLargo(n.notas);
  const resta = Math.max(0, NT_LIMITE - largo);
  const nivel = ntNivel(largo);
  ntEl.medidor.className = "nt-medidor nt-" + nivel;
  ntEl.uso.textContent = ntFmt(largo) + " / " + ntFmt(NT_LIMITE) + " caracteres";
  ntEl.resta.textContent = "quedan " + ntFmt(resta);
  ntEl.barra.style.width = Math.min(100, (largo / NT_LIMITE) * 100).toFixed(1) + "%";
  if (nivel === "ok") {
    ntEl.aviso.hidden = true;
  } else {
    ntEl.aviso.hidden = false;
    ntEl.aviso.textContent =
      resta === 0
        ? "🚫 Este notario está lleno. Ya no caben más notas: elimina o acorta alguna, o crea otro notario."
        : nivel === "critico"
        ? "🚫 Casi lleno: solo quedan " + ntFmt(resta) + " caracteres. Crea otro notario para seguir anotando."
        : "⚠️ Queda poco espacio: solo quedan " + ntFmt(resta) + " caracteres en este notario.";
  }
}

// Contador de la nota que se está escribiendo: cuánto ocupará y si cabe
function ntActualizarContador() {
  const n = ntPorId(NT.abierto);
  if (!n) return;
  const texto = ntLimpiar(ntEl.texto.value);
  if (!texto) {
    ntEl.contador.textContent = "";
    ntEl.contador.className = "nt-contador";
    ntEl.agregar.disabled = false;
    return;
  }
  const total = ntLargo(n.notas.concat([{ id: "0000000000000000", fecha: selloFechaHora(), texto }]));
  const sobran = total - NT_LIMITE;
  if (sobran > 0) {
    ntEl.contador.textContent = "No cabe: te pasas por " + ntFmt(sobran) + " caracteres";
    ntEl.contador.className = "nt-contador nt-contador-error";
    ntEl.agregar.disabled = true;
  } else {
    ntEl.contador.textContent = "Con esta nota: " + ntFmt(total) + " / " + ntFmt(NT_LIMITE);
    ntEl.contador.className = "nt-contador" + (ntNivel(total) === "ok" ? "" : " nt-contador-aviso");
    ntEl.agregar.disabled = false;
  }
}

// Lista de notas del notario abierto (la más reciente arriba)
function ntDibujarNotas() {
  const n = ntPorId(NT.abierto);
  if (!n) return;
  ntDibujarMedidor(n);
  ntActualizarContador();
  ntEl.listaTitulo.textContent = n.notas.length ? "Notas (" + n.notas.length + ")" : "";
  ntEl.lista.innerHTML = "";
  if (!n.notas.length) {
    const p = document.createElement("p");
    p.className = "notas-vacio";
    p.textContent = "Aún no hay notas en este notario. ¡Agrega la primera! ✨";
    ntEl.lista.appendChild(p);
    return;
  }
  n.notas
    .slice()
    .reverse()
    .forEach((nota) => ntEl.lista.appendChild(ntCrearNota(n, nota)));
}

function ntCrearNota(n, nota) {
  const caja = document.createElement("div");
  caja.className = "nt-nota";
  const fecha = document.createElement("div");
  fecha.className = "nt-nota-fecha";
  fecha.textContent = nota.fecha || "";

  if (NT.editandoNota === nota.id) {
    const ta = document.createElement("textarea");
    ta.className = "nt-nota-edit";
    ta.rows = 4;
    ta.value = nota.texto;
    const estado = document.createElement("span");
    estado.className = "notas-estado";
    const fila = document.createElement("div");
    fila.className = "nt-fila";
    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "notas-btn";
    ok.textContent = "Guardar cambios";
    const no = document.createElement("button");
    no.type = "button";
    no.className = "notas-btn notas-btn-sec";
    no.textContent = "Cancelar";
    fila.append(ok, no, estado);
    const contador = document.createElement("div");
    contador.className = "nt-contador";
    const revisar = () => {
      const t = ntLimpiar(ta.value);
      const otras = n.notas.map((x) => (x.id === nota.id ? { id: x.id, fecha: x.fecha, texto: t } : x));
      const sobran = ntLargo(otras) - NT_LIMITE;
      ok.disabled = !t || sobran > 0;
      contador.textContent = sobran > 0 ? "No cabe: te pasas por " + ntFmt(sobran) + " caracteres" : "";
      contador.className = "nt-contador" + (sobran > 0 ? " nt-contador-error" : "");
    };
    ta.addEventListener("input", revisar);
    no.addEventListener("click", () => {
      NT.editandoNota = null;
      ntDibujarNotas();
    });
    ok.addEventListener("click", async () => {
      const t = ntLimpiar(ta.value);
      if (!t) return;
      ok.disabled = true;
      setEstado(estado, "Guardando…");
      try {
        await llamarNotas("notario_nota_guardar", { id: n.id, notaId: nota.id, fecha: nota.fecha, texto: t });
        nota.texto = t;
        NT.editandoNota = null;
        ntDibujarNotas();
        ntDibujarTodo();
      } catch (e) {
        setEstado(estado, "Error: " + e.message, "error");
        ok.disabled = false;
      }
    });
    caja.append(fecha, ta, contador, fila);
    setTimeout(() => ta.focus(), 0);
    return caja;
  }

  const texto = document.createElement("p");
  texto.className = "nt-nota-texto";
  texto.textContent = nota.texto;
  const botones = document.createElement("div");
  botones.className = "nt-nota-botones";
  const editar = document.createElement("button");
  editar.type = "button";
  editar.className = "nt-nota-btn";
  editar.title = "Editar nota";
  editar.setAttribute("aria-label", "Editar nota");
  editar.textContent = "✎";
  editar.addEventListener("click", () => {
    NT.editandoNota = nota.id;
    ntDibujarNotas();
  });
  const borrar = document.createElement("button");
  borrar.type = "button";
  borrar.className = "nt-nota-btn";
  borrar.title = "Eliminar nota";
  borrar.setAttribute("aria-label", "Eliminar nota");
  borrar.textContent = "×";
  borrar.addEventListener("click", async () => {
    if (!window.confirm("¿Eliminar esta nota del notario?")) return;
    setEstado(ntEl.estadoNota, "Eliminando…");
    try {
      await llamarNotas("notario_nota_borrar", { id: n.id, notaId: nota.id });
      n.notas = n.notas.filter((x) => x.id !== nota.id);
      setEstado(ntEl.estadoNota, "Nota eliminada", "ok");
      ntDibujarNotas();
      ntDibujarTodo();
    } catch (e) {
      setEstado(ntEl.estadoNota, "Error: " + e.message, "error");
    }
  });
  botones.append(editar, borrar);
  caja.append(fecha, texto, botones);
  return caja;
}

// ----- Abrir / cerrar la ventana -----
function ntAbrirNuevo(zona) {
  NT.abierto = null;
  NT.zonaNueva = zona;
  NT.editandoNota = null;
  ntEl.titulo.textContent = "Nuevo notario";
  ntEl.nombre.value = "";
  ntEl.desc.value = "";
  ntEl.guardarDatos.textContent = "Crear notario";
  ntEl.borrarNotario.hidden = true;
  ntEl.notas.hidden = true;
  setEstado(ntEl.estadoDatos, "");
  ntModal.hidden = false;
  ntEl.nombre.focus();
}
function ntAbrir(n) {
  NT.abierto = n.id;
  NT.zonaNueva = null;
  NT.editandoNota = null;
  ntEl.titulo.textContent = "📒 Notario";
  ntEl.nombre.value = n.nombre === "Sin nombre" ? "" : n.nombre;
  ntEl.desc.value = n.descripcion || "";
  ntEl.guardarDatos.textContent = "Guardar nombre y descripción";
  ntEl.borrarNotario.hidden = false;
  ntEl.notas.hidden = false;
  ntEl.texto.value = "";
  setEstado(ntEl.estadoDatos, "");
  setEstado(ntEl.estadoNota, "");
  ntModal.hidden = false;
  ntDibujarNotas();
  if (!n.notas.length) ntEl.texto.focus();
}
function ntCerrar(forzar) {
  if (ntModal.hidden) return;
  if (!forzar && ntEl.texto.value.trim() && !window.confirm("Tienes una nota sin agregar. ¿Cerrar y descartarla?")) return;
  ntModal.hidden = true;
  NT.abierto = null;
  NT.zonaNueva = null;
  NT.editandoNota = null;
  ntEl.texto.value = "";
}

// ----- Crear el notario / cambiar nombre y descripción -----
async function ntGuardarDatos() {
  const nombre = ntEl.nombre.value.trim();
  const descripcion = ntEl.desc.value.trim();
  if (!nombre) {
    setEstado(ntEl.estadoDatos, "Ponle un nombre al notario", "error");
    ntEl.nombre.focus();
    return;
  }
  ntEl.guardarDatos.disabled = true;
  setEstado(ntEl.estadoDatos, "Guardando…");
  try {
    const existente = ntPorId(NT.abierto);
    if (existente) {
      await llamarNotas("notario_editar", { id: existente.id, nombre, descripcion });
      existente.nombre = nombre;
      existente.descripcion = descripcion;
      setEstado(ntEl.estadoDatos, "Guardado ✓", "ok");
    } else {
      const nuevo = { id: ntNuevoId(), zona: NT.zonaNueva, nombre, descripcion, fecha: selloFechaHora(), notas: [] };
      await llamarNotas("notario_agregar", { id: nuevo.id, zona: nuevo.zona, nombre, descripcion, fecha: nuevo.fecha });
      NT.lista.push(nuevo);
      ntAbrir(nuevo); // ya creado: ahora se pueden agregar notas dentro
      setEstado(ntEl.estadoDatos, "Notario creado ✓", "ok");
    }
    ntDibujarTodo();
  } catch (e) {
    setEstado(ntEl.estadoDatos, "Error: " + e.message, "error");
  } finally {
    ntEl.guardarDatos.disabled = false;
  }
}

async function ntBorrarNotario() {
  const n = ntPorId(NT.abierto);
  if (!n) return;
  const cuantas = n.notas.length;
  const aviso =
    "¿Eliminar el notario «" + n.nombre + "»" +
    (cuantas ? " junto con sus " + cuantas + (cuantas === 1 ? " nota" : " notas") : "") +
    "? No se puede deshacer.";
  if (!window.confirm(aviso)) return;
  ntEl.borrarNotario.disabled = true;
  setEstado(ntEl.estadoDatos, "Eliminando…");
  try {
    await llamarNotas("notario_borrar", { id: n.id });
    NT.lista = NT.lista.filter((x) => x.id !== n.id);
    ntCerrar(true);
    ntDibujarTodo();
  } catch (e) {
    setEstado(ntEl.estadoDatos, "Error: " + e.message, "error");
  } finally {
    ntEl.borrarNotario.disabled = false;
  }
}

// ----- Agregar una nota dentro del notario abierto -----
async function ntAgregarNota() {
  const n = ntPorId(NT.abierto);
  if (!n) return;
  const texto = ntLimpiar(ntEl.texto.value);
  if (!texto) {
    setEstado(ntEl.estadoNota, "Escribe algo primero", "error");
    return;
  }
  const nota = { id: ntNuevoId(), fecha: selloFechaHora(), texto };
  const sobran = ntLargo(n.notas.concat([nota])) - NT_LIMITE;
  if (sobran > 0) {
    setEstado(ntEl.estadoNota, "No cabe: te pasas por " + ntFmt(sobran) + " caracteres", "error");
    return;
  }
  ntEl.agregar.disabled = true;
  setEstado(ntEl.estadoNota, "Guardando…");
  try {
    await llamarNotas("notario_nota_guardar", { id: n.id, notaId: nota.id, fecha: nota.fecha, texto: nota.texto });
    n.notas.push(nota);
    ntEl.texto.value = "";
    ntDibujarNotas();
    ntDibujarTodo();
    const restan = NT_LIMITE - ntLargo(n.notas);
    setEstado(
      ntEl.estadoNota,
      ntNivel(ntLargo(n.notas)) === "ok" ? "Nota agregada ✓" : "Nota agregada ✓ — ¡queda poco espacio! (" + ntFmt(restan) + " caracteres)",
      "ok"
    );
  } catch (e) {
    setEstado(ntEl.estadoNota, "Error: " + e.message, "error");
  } finally {
    ntEl.agregar.disabled = false;
    ntActualizarContador();
  }
}

ntq(".nt-cerrar").addEventListener("click", () => ntCerrar(false));
ntModal.addEventListener("click", (e) => {
  if (e.target === ntModal) ntCerrar(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !ntModal.hidden) ntCerrar(false);
});
ntEl.guardarDatos.addEventListener("click", ntGuardarDatos);
ntEl.borrarNotario.addEventListener("click", ntBorrarNotario);
ntEl.agregar.addEventListener("click", ntAgregarNota);
ntEl.texto.addEventListener("input", ntActualizarContador);
ntEl.nombre.addEventListener("keydown", (e) => {
  if (e.key === "Enter") ntGuardarDatos();
});

// ----- Botón «Notario» y cuadritos de cada zona -----
function montarNotario(zona, destino, antes) {
  const caja = document.createElement("div");
  caja.className = "nt-zona";
  caja.innerHTML = `
    <div class="nt-barra">
      <button type="button" class="notas-btn nt-nuevo">📒 + Notario</button>
      <span class="notas-estado nt-estado"></span>
    </div>
    <div class="nt-grid"></div>`;
  destino.insertBefore(caja, antes || null);
  const m = { zona, caja, grid: caja.querySelector(".nt-grid"), estado: caja.querySelector(".nt-estado") };
  caja.querySelector(".nt-nuevo").addEventListener("click", () => ntAbrirNuevo(zona));
  NT.montajes.push(m);
  return m;
}

function ntCrearCuadro(n) {
  const largo = ntLargo(n.notas);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "nt-cuadro nt-" + ntNivel(largo);
  b.setAttribute("aria-label", "Abrir el notario " + n.nombre);
  const nombre = document.createElement("span");
  nombre.className = "nt-cuadro-nombre";
  nombre.textContent = "📒 " + n.nombre;
  const desc = document.createElement("span");
  desc.className = "nt-cuadro-desc";
  desc.textContent = n.descripcion ? resumenCorto(n.descripcion, 70) : "Sin descripción";
  const meta = document.createElement("span");
  meta.className = "nt-cuadro-meta";
  const k = n.notas.length;
  meta.textContent =
    k + (k === 1 ? " nota" : " notas") + " · " + ntFmt(largo) + " / " + ntFmt(NT_LIMITE) +
    (largo >= NT_AVISO ? " ⚠️" : "");
  const barra = document.createElement("span");
  barra.className = "nt-cuadro-barra";
  const relleno = document.createElement("i");
  relleno.style.width = Math.min(100, (largo / NT_LIMITE) * 100).toFixed(1) + "%";
  barra.appendChild(relleno);
  b.append(nombre, desc, meta, barra);
  b.addEventListener("click", () => ntAbrir(n));
  return b;
}

function ntDibujarTodo() {
  NT.montajes.forEach((m) => {
    m.grid.innerHTML = "";
    NT.lista.filter((n) => n.zona === m.zona).forEach((n) => m.grid.appendChild(ntCrearCuadro(n)));
  });
  const n = ntPorId(NT.abierto);
  if (n && !ntModal.hidden && NT.editandoNota === null) ntDibujarNotas();
}

async function ntCargar() {
  if (NT.cargando) return;
  NT.cargando = true;
  NT.montajes.forEach((m) => setEstado(m.estado, "Cargando notarios…"));
  try {
    const j = await llamarNotas("notario_listar");
    NT.lista = (Array.isArray(j.notarios) ? j.notarios : []).map((n) =>
      Object.assign({}, n, { notas: Array.isArray(n.notas) ? n.notas : [] })
    );
    NT.cargados = true;
    NT.montajes.forEach((m) => setEstado(m.estado, ""));
    ntDibujarTodo();
  } catch (e) {
    NT.montajes.forEach((m) => setEstado(m.estado, "Error: " + e.message, "error"));
  } finally {
    NT.cargando = false;
  }
}

// Se llama cuando cambia la sesión o se cambia de página: lee los notarios la primera vez que se ve una zona
function actualizarNotarios() {
  if (typeof NT === "undefined" || !NT || !NT.montajes) return;
  if (!sesionVigente()) {
    NT.cargados = false;
    NT.lista = [];
    ntCerrar(true);
    ntDibujarTodo();
    return;
  }
  if (!NT.cargados && !NT.cargando && NT.montajes.some((m) => m.caja.offsetParent !== null)) ntCargar();
  else ntDibujarTodo();
}

// El botón ↻ de cada zona también vuelve a leer los notarios
function ntRecargarSiHaySesion() {
  if (sesionVigente()) {
    NT.cargados = false;
    ntCargar();
  }
}

// Dónde aparece el botón «+ Notario» en cada zona
(function montarNotariosEnZonas() {
  const zonaEt = (clave) => zonas.find((z) => z.cfg.seccion === clave);
  montarNotario("notas", document.getElementById("notas-contenido"), document.getElementById("notas-lista"));
  ["actividades", "trabajo", "pedidos-yeso"].forEach((clave) => {
    const z = zonaEt(clave);
    montarNotario(clave, z.contenido, z.lista);
  });
  [
    ["ejercicio", "ej-contenido"],
    ["diario", "di-contenido"],
    ["deudas", "de-contenido"],
    ["informacion", "ip-contenido"],
    ["comandos", "cm-contenido"],
    ["bazar", "bz-contenido"],
  ].forEach(([clave, id]) => montarNotario(clave, document.getElementById(id), null));
  ["notas-actualizar", "ej-actualizar", "di-actualizar", "de-actualizar", "ip-actualizar", "cm-actualizar", "bz-actualizar"].forEach((id) => {
    const b = document.getElementById(id);
    if (b) b.addEventListener("click", ntRecargarSiHaySesion);
  });
  document.querySelectorAll(".zona-actualizar").forEach((b) => b.addEventListener("click", ntRecargarSiHaySesion));
})();

dibujarCuenta();
programarCaducidad();
iniciarGoogle();

// ---------- Inicio ----------
// Al abrir o recargar la página (F5) el calendario ya aparece en la fecha actual
mostrarSeccion("calendario");
cargarDatos();
