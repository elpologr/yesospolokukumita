// ══════════════════════════════════════════════════════════════════════════════
// YESOS POLO KUKÚMITA — Mesa (solo administradores)
// Se carga DESPUÉS de app.js y admin-producto.js (usa: auth, esCorreoAdmin, mostrarToast, CONFIG,
// y, para subir fotos, _leerImagenProducto y _postAppsScript de admin-producto.js).
//
// Una mesa negra en vista isométrica de 200 columnas × 60 filas de celdas, dividida en 40 mesas chicas
// (10 a lo ancho × 4 a lo largo, de 20 columnas × 15 filas cada una), separadas por un hueco.
// Cada celda puede llevar una imagen de imgbb (link https://i.ibb.co/...), pegando el link, pegando
// varios links de golpe o subiendo fotos (se suben a imgbb por el Apps Script, igual que en "Agregar producto").
//
// Se dibuja en <canvas> (15,000 elementos HTML serían demasiado pesados). Para cuidar la memoria,
// de cada imagen se guarda una miniatura y solo se cargan las que están a la vista.
// Se guarda en este dispositivo (localStorage) y, si Firestore lo permite, también en
// usuarios/{uid}/mesa/tablero (esa ruta ya está permitida por las reglas actuales).
//
// El botón del perfil solo se muestra a los correos de CONFIG.CORREOS_ADMIN. Esto es solo una vista
// privada: no hay nada que el servidor deba proteger (no toca la hoja de productos).
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var NC = 200, NF = 60;       // la mesa grande, en horizontal: 200 columnas × 60 filas de celdas
    var MC = 20, MF = 15;        // cada mesa chica mide 20 columnas × 15 filas
    var G = 3;                   // hueco vacío (en celdas) entre una mesa y otra, a lo ancho (columnas)
    var GF = 6;                  // hueco entre una mesa y la de arriba (filas): el doble, ahí se escribe la descripción de cada mesa
    var MESAS_C = NC / MC, MESAS_F = NF / MF;   // 10 mesas a lo ancho × 4 a lo largo = 40 mesas
    var TW = 80, TH = 40;        // ancho y alto de una celda en pantalla (proyección isométrica 2:1)
    var M = 1.5;                 // margen de la mesa alrededor de la cuadrícula (en celdas)
    var DEPTH = 40, LEG = 300;   // grosor del tablero y largo de las patas
    var CLAVE = 'polo_mesa_v1_';
    var MAX_ESCALA = 4;
    var VEL_AUTO = 750;          // velocidad máxima (px de pantalla por segundo) del desplazamiento automático al arrastrar cerca del borde
    var RETARDO_AUTO = 180;      // ms que hay que quedarse cerca del borde antes de que empiece a desplazarse
    var UMBRAL_CARGA = 14;       // ancho de celda (px en pantalla) desde el cual se cargan imágenes
    var UMBRAL_COMPLETA = 130;   // desde este ancho se usa la imagen completa en vez de la miniatura
    var MAX_COMPLETAS = 40;      // imágenes completas en memoria a la vez
    var LIB_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm';
    var MODELO = 'isnet_fp16';
    var MAX_LADO_FOTO = 1280;    // la foto se reduce antes de quitar el fondo (más rápido)
    var MAX_LADO_SALIDA = 1024;  // tamaño máximo de la pieza que se sube
    var CODIGO_WORKER = [
        "self.onmessage = async function (ev) {",
        "  var d = ev.data;",
        "  try {",
        "    var mod = await import(d.lib);",
        "    var fn = mod.removeBackground || mod.default;",
        "    var res = await fn(d.blob, { model: d.modelo, progress: function (k, cur, tot) { self.postMessage({ progreso: true, cur: cur, tot: tot }); } });",
        "    self.postMessage({ ok: true, blob: res });",
        "  } catch (e) { self.postMessage({ error: String((e && e.message) || e) }); }",
        "};"
    ].join('\n');
    var RE_UNA = /(?:https:\/\/i\.ibb\.co\/|imagenes\/)[^\s,"'<>\[\]()]+/i;   // imgbb o una imagen del repo (imagenes/pieza/miniatura.webp)
    var RE_VARIAS = /(?:https:\/\/i\.ibb\.co\/|imagenes\/)[^\s,"'<>\[\]()]+/gi;

    var S = {
        celdas: {}, previas: {}, mesas: {}, vinculos: {}, ts: 0, sel: null, mover: null, multi: {}, modoMulti: false, autoRaf: 0,
        scale: 0.05, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, minEscala: 0.03, fitEscala: 0.05,
        raf: 0, abierta: false, ajustada: false, vista3d: true,
        thumb: {}, full: {}, fullOrden: [], fallo: {}, vuelo: {}, pend: [], enVuelo: 0,
        nubeTimer: null, nubeOk: null, subiendo: false, procesando: false, worker: null, workerTimer: null
    };
    var root = null, cv = null;

    function $(id) { return document.getElementById(id); }
    function proj(c, r) { return [(c - r) * TW / 2, (c + r) * TH / 2]; }
    function clave(r, c) { return r + ',' + c; }
    // Posición de una columna/fila en la mesa grande, contando los huecos entre mesas
    function px(c) { return c + Math.floor(c / MC) * G; }
    function py(r) { return r + Math.floor(r / MF) * GF; }
    function pc(c, r) { return proj(px(c), py(r)); }        // esquina de la celda (columna c, fila r), como proj pero con huecos
    var AC = NC + (MESAS_C - 1) * G, AF = NF + (MESAS_F - 1) * GF;   // medidas totales con huecos
    // índice de celda a partir de una posición continua (null si cae en un hueco o fuera de la mesa)
    function idxExacto(f, m, n, g) {
        if (f < 0) return -1;
        var b = m + g, bl = Math.floor(f / b), d = f - bl * b;
        if (d >= m) return -1;
        var i = bl * m + Math.floor(d);
        return i < n ? i : -1;
    }
    // límite del rango visible: si cae en un hueco, se toma la celda más cercana de la mesa vecina
    function idxLimite(f, m, n, modo, g) {
        var i;
        if (f < 0) i = modo === 'ini' ? 0 : -1;
        else {
            var b = m + g, bl = Math.floor(f / b), d = f - bl * b;
            i = d >= m ? (modo === 'ini' ? (bl + 1) * m : (bl + 1) * m - 1) : bl * m + Math.floor(d);
        }
        return Math.max(-1, Math.min(n, i));
    }
    // Disposición de los datos guardados: 1 = mesas en vertical (5 a lo ancho × 10 a lo largo), 2 = en horizontal (10 × 5).
    // Los datos de la disposición 1 se giran una vez (fila ↔ columna) para que cada pieza y cada descripción siga en su mesa.
    // 3 = cada mesa chica de 20 columnas × 15 filas (antes, en la disposición 2, eran 15 columnas × 20 filas).
    var DISPOSICION = 3;
    function transponer(m) {
        var o = {};
        Object.keys(m || {}).forEach(function (k) { var q = k.split(','); o[q[1] + ',' + q[0]] = m[k]; });
        return o;
    }
    // Disposición 2 → 3: dentro de cada mesa chica se gira la cuadrícula (fila ↔ columna), de 15×20 a 20×15.
    // Cada pieza se queda en su misma mesa (mismo número de mesa); las descripciones de mesa no cambian de clave.
    function transponerDentroDeMesas(m) {
        var o = {};
        Object.keys(m || {}).forEach(function (k) {
            var q = k.split(','), r = +q[0], c = +q[1];
            var mr = Math.floor(r / 20), mc = Math.floor(c / 15), lr = r % 20, lc = c % 15;
            o[(mr * 15 + lc) + ',' + (mc * 20 + lr)] = m[k];
        });
        return o;
    }
    function normalizarDatos(celdas, previas, mesas, disp) {
        var d = disp || 1;
        celdas = celdas || {}; previas = previas || {}; mesas = mesas || {};
        if (d < 2) { celdas = transponer(celdas); previas = transponer(previas); mesas = transponer(mesas); }
        if (d < 3) { celdas = transponerDentroDeMesas(celdas); previas = transponerDentroDeMesas(previas); }
        return { celdas: celdas, previas: previas, mesas: mesas };
    }
    function numeroMesa(mr, mc) { return mr * MESAS_C + mc + 1; }                 // 1..40, de izquierda a derecha y de arriba abajo
    function mesaDe(ce) { return { mr: Math.floor(ce.r / MF), mc: Math.floor(ce.c / MC) }; }

    // ── Botón del perfil: solo administradores ──
    function actualizarBotonMesa() {
        var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        var admin = (typeof esCorreoAdmin === 'function') && esCorreoAdmin(user);
        var btn = $('btnAbrirMesa');
        if (btn) btn.style.display = admin ? 'flex' : 'none';
        if (!admin && S.abierta) cerrarMesa();
    }
    window.actualizarBotonMesa = actualizarBotonMesa;

    (function engancharAuth() {
        if (typeof auth === 'undefined' || !auth.onAuthStateChanged || typeof esCorreoAdmin !== 'function') {
            setTimeout(engancharAuth, 300);
            return;
        }
        auth.onAuthStateChanged(function () { actualizarBotonMesa(); intentarAbrirDirecto(); });
        actualizarBotonMesa();
        intentarAbrirDirecto();
    })();

    // ── Construcción de la pantalla (una sola vez) ──
    function construir() {
        if (root) return;
        root = document.createElement('div');
        root.id = 'pantallaMesa';
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', 'Mesa');
        root.innerHTML =
            '<div class="mesa-header">' +
                '<button class="mesa-volver" type="button" id="mesaVolver" aria-label="Volver">‹</button>' +
                '<button class="mesa-nueva-pestana" type="button" id="mesaNuevaPestana" title="Abrir la Mesa en una pestaña nueva">↗ Nueva pestaña</button>' +
                '<h3>Mesa</h3>' +
                '<span class="mesa-contador" id="mesaContador"></span>' +
            '</div>' +
            '<div class="mesa-lienzo" id="mesaLienzo">' +
                '<canvas id="mesaCanvas"></canvas>' +
                '<div class="mesa-zoom">' +
                    '<button type="button" id="mesaMas" aria-label="Acercar">+</button>' +
                    '<button type="button" id="mesaMenos" aria-label="Alejar">−</button>' +
                    '<button type="button" id="mesaAjustar" aria-label="Ver toda la mesa">⤢</button>' +
                    '<button type="button" id="mesaVista" aria-label="Cambiar entre vista de pie y plana" title="Piezas de pie / acostadas">🧊</button>' +
                    '<button type="button" id="mesaMulti" aria-label="Selección múltiple" title="Selección múltiple (también: Ctrl o Mayús + clic)">☑</button>' +
                    '<button type="button" id="mesaSelMesa" aria-label="Seleccionar todas las piezas de la mesa" title="Seleccionar todas las piezas de la mesa elegida (para moverlas juntas)">▦</button>' +
                    '<button type="button" id="mesaRecorrer" aria-label="Recorrer la mesa una posición a la derecha" title="Recorrer la mesa elegida una posición a la derecha (las siguientes se recorren hasta llegar a una mesa vacía)">⇉</button>' +
                '</div>' +
            '</div>' +
            '<div class="mesa-panel">' +
                '<div class="mesa-celda-info" id="mesaCeldaInfo">Toca una celda para elegirla. Mantén presionada una pieza para moverla.</div>' +
                '<div id="mesaMultiBloque" style="display:none; flex-direction:column; gap:4px;">' +
                    '<div class="mesa-desc-titulo" id="mesaMultiTexto"></div>' +
                    '<button class="mesa-btn" type="button" id="mesaMultiLimpiar">Quitar selección</button>' +
                '</div>' +
                '<button class="mesa-btn" type="button" id="mesaFaltan">🔎 Siguiente pieza sin 3D</button>' +
                '<div id="mesaEditor" style="display:none; flex-direction:column; gap:10px;">' +
                    '<div class="mesa-fila">' +
                        '<input id="mesaUrl" class="mesa-input" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="imagenes/pieza/miniatura.webp  ó  https://i.ibb.co/...">' +
                        '<button class="mesa-btn principal" type="button" id="mesaPoner">Poner</button>' +
                    '</div>' +
                    '<div class="mesa-fila">' +
                        '<button class="mesa-btn" type="button" id="mesaSubir">📷 Subir fotos</button>' +
                        '<button class="mesa-btn peligro" type="button" id="mesaQuitar">Quitar imagen</button>' +
                    '</div>' +
                    '<div class="mesa-previa">' +
                        '<div class="mesa-previa-titulo">👁 Vista previa <small>(temporal: se muestra mientras la celda no tenga 3D)</small></div>' +
                        '<div class="mesa-fila">' +
                            '<input id="mesaPreviaUrl" class="mesa-input" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://i.ibb.co/...">' +
                            '<button class="mesa-btn" type="button" id="mesaPreviaPoner">Poner</button>' +
                        '</div>' +
                        '<button class="mesa-btn peligro" type="button" id="mesaPreviaQuitar">Quitar vista previa</button>' +
                    '</div>' +
                    '<div class="mesa-vinculo">' +
                        '<div class="mesa-vinculo-titulo">🔗 Producto asociado</div>' +
                        '<div class="mesa-vinculo-actual" id="mesaVinculoActual"></div>' +
                        '<input id="mesaVinculoBuscar" class="mesa-input" type="text" autocomplete="off" spellcheck="false" placeholder="Buscar producto por nombre…">' +
                        '<div class="mesa-vinculo-lista" id="mesaVinculoLista"></div>' +
                        '<div class="mesa-fila">' +
                            '<button class="mesa-btn" type="button" id="mesaVinculoImagen">Usar su imagen</button>' +
                            '<button class="mesa-btn peligro" type="button" id="mesaVinculoQuitar">Quitar</button>' +
                        '</div>' +
                    '</div>' +
                    '<button class="mesa-btn principal" type="button" id="mesaCubo">🧊 Pieza en 6 vistas (3D, sin imgbb)</button>' +
                    '<button class="mesa-btn" type="button" id="mesaSinFondo">✂️ Quitar fondo y subir a la otra cuenta</button>' +
                    '<input type="file" id="mesaArchivos" accept="image/*" multiple style="display:none">' +
                    '<details class="mesa-detalle">' +
                        '<summary>Pegar varios links de imgbb</summary>' +
                        '<textarea id="mesaVarios" class="mesa-input" rows="4" placeholder="Un link por línea. Se colocan desde la celda elegida hacia la derecha y siguen en la fila de abajo."></textarea>' +
                        '<button class="mesa-btn" type="button" id="mesaPonerVarios">Colocar links</button>' +
                    '</details>' +
                '</div>' +
                '<div id="mesaDescBloque" style="display:none; flex-direction:column; gap:2px;">' +
                    '<div class="mesa-desc-titulo" id="mesaDescTitulo"></div>' +
                    '<textarea id="mesaDesc" class="mesa-input" rows="3" maxlength="1000" placeholder="Descripción de esta mesa… (se guarda sola y se copia a la hoja de Google, pestaña «Mesa»)"></textarea>' +
                '</div>' +
                '<div class="mesa-estado" id="mesaEstado"></div>' +
                '<button class="mesa-link-peligro" type="button" id="mesaVaciar">Vaciar toda la mesa</button>' +
            '</div>';
        document.body.appendChild(root);
        cv = $('mesaCanvas');

        $('mesaVolver').addEventListener('click', cerrarMesa);
        $('mesaNuevaPestana').addEventListener('click', abrirMesaEnPestanaNueva);
        // Si esta pestaña ya se abrió directamente en la Mesa, el botón sobra
        if (abrirDirecto || window._mesaPestanaPropia) $('mesaNuevaPestana').style.display = 'none';
        $('mesaMas').addEventListener('click', function () { zoomCentro(1.4); });
        $('mesaMenos').addEventListener('click', function () { zoomCentro(1 / 1.4); });
        $('mesaAjustar').addEventListener('click', function () { ajustarVista(); pedirDibujo(); });
        try { S.vista3d = localStorage.getItem('polo_mesa_vista') !== 'plana'; } catch (e) { /* sin preferencia guardada */ }
        $('mesaVista').addEventListener('click', function () {
            S.vista3d = !S.vista3d;
            try { localStorage.setItem('polo_mesa_vista', S.vista3d ? 'pie' : 'plana'); } catch (e) {}
            estado(S.vista3d ? 'Vista: piezas de pie, con luz y sombra.' : 'Vista: piezas acostadas sobre la mesa.');
            pedirDibujo();
        });
        $('mesaPoner').addEventListener('click', ponerDesdeCampo);
        $('mesaUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ponerDesdeCampo(); } });
        $('mesaQuitar').addEventListener('click', quitarSeleccionada);
        $('mesaSinFondo').addEventListener('click', quitarFondoSeleccionada);
        $('mesaDesc').addEventListener('input', function () { clearTimeout(S.descTimer); S.descTimer = setTimeout(guardarDescripcion, 800); });
        $('mesaDesc').addEventListener('blur', function () { clearTimeout(S.descTimer); guardarDescripcion(); });
        $('mesaPreviaPoner').addEventListener('click', ponerPrevia);
        $('mesaPreviaUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ponerPrevia(); } });
        $('mesaPreviaQuitar').addEventListener('click', quitarPrevia);
        $('mesaFaltan').addEventListener('click', irAFaltante);
        $('mesaMulti').addEventListener('click', alternarModoMulti);
        $('mesaMultiLimpiar').addEventListener('click', function () { limpiarMulti(); estado('Selección quitada.'); });
        $('mesaVinculoBuscar').addEventListener('input', pintarListaVinculo);
        $('mesaVinculoBuscar').addEventListener('focus', pintarListaVinculo);
        $('mesaVinculoQuitar').addEventListener('click', quitarVinculo);
        $('mesaVinculoImagen').addEventListener('click', usarImagenDelProducto);
        $('mesaSelMesa').addEventListener('click', seleccionarTodasDeMesa);
        $('mesaRecorrer').addEventListener('click', recorrerMesaADerecha);
        $('mesaCubo').addEventListener('click', function () {
            if (typeof window.abrirCubo3D === 'function') window.abrirCubo3D();
            else estado('Falta cargar cubo-3d.js en index.html.', true);
        });
        $('mesaSubir').addEventListener('click', function () { $('mesaArchivos').click(); });
        $('mesaArchivos').addEventListener('change', subirFotos);
        $('mesaPonerVarios').addEventListener('click', ponerVarios);
        $('mesaVaciar').addEventListener('click', vaciarMesa);
        window.addEventListener('resize', function () { if (S.abierta) { medir(); pedirDibujo(); } });
        document.addEventListener('keydown', function (e) {
            if (S.abierta && e.key === 'Escape' && document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') cerrarMesa();
        });
        engancharGestos();
    }

    // ── Abrir la Mesa en una pestaña nueva ──
    // La Mesa es una pantalla dentro de la misma página, así que "pestaña nueva" significa abrir el sitio con
    // ?mesa=1: esa pestaña entra directo a la Mesa en cuanto Firebase confirma que eres administrador
    // (la sesión se comparte entre pestañas del mismo sitio, no hay que volver a iniciar sesión).
    var abrirDirecto = /(?:^|[?&])mesa=1(?:&|$)/.test(window.location.search);
    window._mesaPestanaPropia = abrirDirecto;
    function abrirMesaEnPestanaNueva() {
        var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (!(typeof esCorreoAdmin === 'function' && esCorreoAdmin(user))) return;
        var url = window.location.origin + window.location.pathname + '?mesa=1';
        var w = window.open(url, '_blank');
        if (!w) { if (typeof mostrarToast === 'function') mostrarToast('El navegador bloqueó la pestaña nueva. Permite ventanas emergentes para este sitio.'); return; }
        cerrarMesa(); // esta pestaña vuelve al sitio; la Mesa queda en la nueva
    }
    window.abrirMesaEnPestanaNueva = abrirMesaEnPestanaNueva;
    // Botón "Mesa" del perfil: con Ctrl/Cmd/Mayús abre la pestaña nueva; con clic normal, como siempre
    window.abrirMesaDesdeBoton = function (ev) {
        if (ev && (ev.ctrlKey || ev.metaKey || ev.shiftKey)) abrirMesaEnPestanaNueva();
        else abrirMesa();
    };
    function intentarAbrirDirecto() {
        if (!abrirDirecto) return;
        var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (!(typeof esCorreoAdmin === 'function' && esCorreoAdmin(user))) return;
        abrirDirecto = false;
        abrirMesa();
        // Deja la dirección sin ?mesa=1 para que al recargar no vuelva a abrirse sola
        if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }

    // ── Abrir / cerrar ──
    function abrirMesa() {
        var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (!(typeof esCorreoAdmin === 'function' && esCorreoAdmin(user))) return;
        construir();
        cargarLocal();
        root.classList.add('abierta');
        document.body.style.overflow = 'hidden';
        S.abierta = true;
        requestAnimationFrame(function () {
            medir();
            if (!S.ajustada) { ajustarVista(); S.ajustada = true; }
            pintarPanel();
            pedirDibujo();
        });
        cargarNube();
    }
    window.abrirMesa = abrirMesa;

    function cerrarMesa() {
        if (!root || !S.abierta) return;
        root.classList.remove('abierta');
        S.abierta = false;
        var perfil = document.getElementById('pantallaPerfil');
        if (!(perfil && perfil.classList.contains('activo'))) document.body.style.overflow = '';
    }
    window.cerrarMesa = cerrarMesa;

    // ── Vista: tamaño del lienzo, ajuste y zoom ──
    function medir() {
        var l = $('mesaLienzo'); if (!l || !cv) return;
        var r = l.getBoundingClientRect();
        S.w = Math.max(1, r.width); S.h = Math.max(1, r.height);
        S.dpr = Math.min(window.devicePixelRatio || 1, 2);
        cv.width = Math.round(S.w * S.dpr);
        cv.height = Math.round(S.h * S.dpr);
    }

    function ajustarVista() {
        var bw = (AC + AF + 4 * M) * TW / 2;
        var yArriba = -(M + GF / 2) * TH, yAbajo = (AC + AF + 2 * M) * TH / 2 + DEPTH + 30;
        var k = Math.min(S.w * 0.94 / bw, S.h * 0.94 / (yAbajo - yArriba));
        S.fitEscala = k; S.minEscala = k * 0.7;
        S.scale = k;
        S.ox = S.w / 2 - (AC - AF) * TW / 4 * k;   // centra la mesa aunque no sea cuadrada
        S.oy = S.h / 2 - (yArriba + yAbajo) / 2 * k;
    }

    function zoomEn(sx, sy, nueva) {
        nueva = Math.max(S.minEscala, Math.min(MAX_ESCALA, nueva));
        var wx = (sx - S.ox) / S.scale, wy = (sy - S.oy) / S.scale;
        S.scale = nueva;
        S.ox = sx - wx * nueva; S.oy = sy - wy * nueva;
        pedirDibujo();
    }
    function zoomCentro(f) { zoomEn(S.w / 2, S.h / 2, S.scale * f); }

    function centrarEn(c, r, escala) {
        var p = proj(px(c) + 0.5, py(r) + 0.5);
        S.scale = Math.max(S.minEscala, Math.min(MAX_ESCALA, escala));
        S.ox = S.w / 2 - p[0] * S.scale;
        S.oy = S.h / 2 - p[1] * S.scale;
    }

    // ── Gestos: arrastrar, pellizcar, rueda y toque ──
    function engancharGestos() {
        var ptrs = {}, drag = null, pinch = null, timerMover = null;

        function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
        function dosPuntos() { var ids = Object.keys(ptrs); return [ptrs[ids[0]], ptrs[ids[1]]]; }

        cv.addEventListener('pointerdown', function (e) {
            try { cv.setPointerCapture(e.pointerId); } catch (x) {}
            ptrs[e.pointerId] = pos(e);
            var n = Object.keys(ptrs).length;
            if (n === 1) {
                drag = { x: ptrs[e.pointerId].x, y: ptrs[e.pointerId].y, ox: S.ox, oy: S.oy, movido: false, tecla: !!(e.ctrlKey || e.metaKey || e.shiftKey) };
                // Mantener presionada una celda con imagen → se "levanta" para moverla
                clearTimeout(timerMover);
                var ce0 = celdaEn(drag.x, drag.y);
                if (ce0 && tieneContenido(ce0)) {
                    var idPtr = e.pointerId;
                    timerMover = setTimeout(function () {
                        if (!drag || drag.movido || !ptrs[idPtr] || Object.keys(ptrs).length !== 1) return;
                        var q = ptrs[idPtr];
                        S.mover = { desde: ce0, hover: ce0, x: q.x, y: q.y };
                        // Si la pieza forma parte de una selección múltiple, se levantan todas juntas
                        var nMulti = Object.keys(S.multi).length;
                        if (nMulti > 1 && S.multi[clave(ce0.r, ce0.c)]) {
                            S.mover.grupo = []; S.mover.set = {};
                            Object.keys(S.multi).forEach(function (k2) {
                                var p2 = k2.split(','), r2 = +p2[0], c2 = +p2[1];
                                if (!tieneContenido({ r: r2, c: c2 })) return;
                                S.mover.grupo.push({ r: r2, c: c2, dr: r2 - ce0.r, dc: c2 - ce0.c });
                                S.mover.set[k2] = 1;
                            });
                        } else if (nMulti) { S.multi = {}; pintarPanel(); }
                        drag = null;
                        try { if (navigator.vibrate) navigator.vibrate(25); } catch (x) {}
                        estado(S.mover.grupo
                            ? 'Arrastrando ' + S.mover.grupo.length + ' piezas. Suéltalas en su nuevo lugar (deben caer en celdas vacías). Acerca el cursor al borde para desplazar la vista.'
                            : 'Arrastra la pieza a otra celda y suéltala. (Si la celda tiene algo, intercambian lugar.) Acerca el cursor al borde para desplazar la vista.');
                        iniciarAutoDesplazamiento();
                        pedirDibujo();
                    }, 450);
                }
            } else if (n === 2) {
                clearTimeout(timerMover);
                if (S.mover) { S.mover = null; estado('Movimiento cancelado.'); pedirDibujo(); }
                drag = null;
                var p = dosPuntos();
                var mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
                pinch = { dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1, escala: S.scale,
                          wx: (mx - S.ox) / S.scale, wy: (my - S.oy) / S.scale };
            }
        });

        cv.addEventListener('pointermove', function (e) {
            if (!ptrs[e.pointerId]) return;
            ptrs[e.pointerId] = pos(e);
            if (S.mover) {
                var m = ptrs[e.pointerId];
                S.mover.x = m.x; S.mover.y = m.y; S.mover.hover = celdaEn(m.x, m.y);
                pedirDibujo();
                return;
            }
            if (pinch && Object.keys(ptrs).length >= 2) {
                var p = dosPuntos();
                var mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
                var d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
                S.scale = Math.max(S.minEscala, Math.min(MAX_ESCALA, pinch.escala * d / pinch.dist));
                S.ox = mx - pinch.wx * S.scale; S.oy = my - pinch.wy * S.scale;
                pedirDibujo();
            } else if (drag) {
                var q = ptrs[e.pointerId];
                var dx = q.x - drag.x, dy = q.y - drag.y;
                if (!drag.movido && Math.hypot(dx, dy) > 6) { drag.movido = true; clearTimeout(timerMover); }
                if (drag.movido) { S.ox = drag.ox + dx; S.oy = drag.oy + dy; pedirDibujo(); }
            }
        });

        function soltar(e) {
            if (!ptrs[e.pointerId]) return;
            clearTimeout(timerMover);
            if (S.mover) {
                var mv = S.mover; S.mover = null;
                delete ptrs[e.pointerId]; drag = null; pinch = null;
                if (e.type === 'pointerup' && mv.hover && (mv.hover.r !== mv.desde.r || mv.hover.c !== mv.desde.c)) { if (mv.grupo) moverGrupo(mv, mv.hover); else moverCelda(mv.desde, mv.hover); }
                else { estado(e.type === 'pointerup' ? 'La pieza se quedó en su lugar.' : 'Movimiento cancelado.'); pedirDibujo(); }
                return;
            }
            var eraToque = drag && !drag.movido && Object.keys(ptrs).length === 1 && e.type === 'pointerup';
            var punto = ptrs[e.pointerId], teclaMulti = !!(drag && drag.tecla);
            delete ptrs[e.pointerId];
            if (eraToque) seleccionarEn(punto.x, punto.y, teclaMulti);
            if (Object.keys(ptrs).length < 2) pinch = null;
            drag = null;
        }
        cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });   // el toque largo no abre menú
        cv.addEventListener('pointerup', soltar);
        cv.addEventListener('pointercancel', soltar);

        cv.addEventListener('wheel', function (e) {
            e.preventDefault();
            var p = pos(e);
            zoomEn(p.x, p.y, S.scale * Math.exp(-e.deltaY * 0.0015));
        }, { passive: false });
    }

    // ── Mover una celda (mantener presionada y arrastrar) ──
    function tieneContenido(ce) { var k = clave(ce.r, ce.c); return !!(S.celdas[k] || S.previas[k]); }
    function moverCelda(a, b) {
        var ka = clave(a.r, a.c), kb = clave(b.r, b.c), habia = tieneContenido(b);
        [S.celdas, S.previas, S.vinculos].forEach(function (M) {
            var va = M[ka], vb = M[kb];
            delete M[ka]; delete M[kb];
            if (va) M[kb] = va;
            if (vb) M[ka] = vb;
        });
        S.sel = { r: b.r, c: b.c };
        estado(habia ? '✔ Las dos piezas intercambiaron lugar.' : '✔ Pieza movida a fila ' + (b.r + 1) + ', columna ' + (b.c + 1) + '.');
        cambioGuardable();
    }

    // ── Mover varias piezas a la vez ──
    // Cada pieza conserva su posición relativa a la pieza que se sostiene (la "ancla").
    // Si alguna caería fuera de la mesa o sobre una pieza que no es del grupo, no se mueve nada.
    function planGrupo(mv, h) {
        var dr0 = h.r - mv.desde.r, dc0 = h.c - mv.desde.c, destinos = [], fuera = 0, ocupadas = 0;
        mv.grupo.forEach(function (g) {
            var r = g.r + dr0, c = g.c + dc0;
            if (r < 0 || r >= NF || c < 0 || c >= NC) { fuera++; return; }
            var ocupada = !mv.set[clave(r, c)] && tieneContenido({ r: r, c: c });
            if (ocupada) ocupadas++;
            destinos.push({ g: g, r: r, c: c, ocupada: ocupada });
        });
        return { destinos: destinos, fuera: fuera, ocupadas: ocupadas, ok: !fuera && !ocupadas };
    }
    function moverGrupo(mv, h) {
        var plan = planGrupo(mv, h);
        if (!plan.ok) {
            estado(plan.fuera
                ? 'No se movieron: algunas piezas quedarían fuera de la mesa.'
                : 'No se movieron: ' + plan.ocupadas + (plan.ocupadas === 1 ? ' celda de destino ya tiene' : ' celdas de destino ya tienen') + ' una pieza. Elige un lugar vacío.', true);
            pedirDibujo();
            return;
        }
        [S.celdas, S.previas, S.vinculos].forEach(function (M) {
            var vals = plan.destinos.map(function (d) { return M[clave(d.g.r, d.g.c)]; });
            plan.destinos.forEach(function (d) { delete M[clave(d.g.r, d.g.c)]; });
            plan.destinos.forEach(function (d, i) { if (vals[i]) M[clave(d.r, d.c)] = vals[i]; });
        });
        S.multi = {};
        plan.destinos.forEach(function (d) { S.multi[clave(d.r, d.c)] = 1; });
        S.sel = { r: h.r, c: h.c };
        estado('✔ ' + plan.destinos.length + ' piezas movidas juntas.');
        cambioGuardable();
    }

    // ── Selección múltiple ──
    function limpiarMulti() { S.multi = {}; pintarPanel(); pedirDibujo(); }
    function pintarBotonMulti() {
        var b = $('mesaMulti'); if (!b) return;
        b.style.background = S.modoMulti ? '#e8607a' : '';
        b.style.borderColor = S.modoMulti ? '#e8607a' : '';
    }
    function alternarModoMulti() {
        S.modoMulti = !S.modoMulti;
        if (S.modoMulti && !Object.keys(S.multi).length && S.sel && tieneContenido(S.sel)) S.multi[clave(S.sel.r, S.sel.c)] = 1;
        pintarBotonMulti(); pintarPanel(); pedirDibujo();
        estado(S.modoMulti ? 'Selección múltiple activada: toca las piezas para marcarlas o desmarcarlas.' : 'Selección múltiple desactivada (las piezas marcadas siguen marcadas).');
    }

    // ── Producto asociado a una celda ──
    // Cada celda puede asociarse a un producto del catálogo (lista que ya carga app.js en «listaProductos»).
    // Se guarda {n: nombre, i: primera imagen del producto}; para encontrarlo después se compara primero la
    // imagen y, si cambió, el nombre. El vínculo viaja con la celda al moverla, intercambiarla o recorrer mesas.
    function catalogo() { return (typeof listaProductos !== 'undefined' && listaProductos && listaProductos.length) ? listaProductos : []; }
    function productoDeVinculo(v) {
        if (!v) return null;
        var L = catalogo(), i;
        if (v.i) for (i = 0; i < L.length; i++) { if (L[i].imagen === v.i) return L[i]; }
        if (v.n) for (i = 0; i < L.length; i++) { if (L[i].nombre === v.n) return L[i]; }
        return null;
    }
    function normBusqueda(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
    function pintarVinculo() {
        var act = $('mesaVinculoActual'); if (!act || !S.sel) return;
        var k = clave(S.sel.r, S.sel.c), v = S.vinculos[k], p = productoDeVinculo(v);
        act.textContent = !v ? 'Ninguno todavía.' : p ? '✔ ' + p.nombre + (p.precioNormal ? ' · $' + p.precioNormal : '') : '⚠ ' + v.n + ' (ya no aparece en el catálogo)';
        $('mesaVinculoQuitar').disabled = !v;
        $('mesaVinculoImagen').disabled = !p || !p.imagen;
        if (S.vinKey !== k) {            // cambió la celda elegida: se limpia la búsqueda
            S.vinKey = k;
            var b = $('mesaVinculoBuscar'); if (b) b.value = '';
            pintarListaVinculo();
        }
    }
    function pintarListaVinculo() {
        var cont = $('mesaVinculoLista'); if (!cont) return;
        var q = normBusqueda($('mesaVinculoBuscar').value.trim());
        cont.innerHTML = '';
        if (!q) { cont.style.display = 'none'; return; }     // la lista solo aparece al escribir
        var L = catalogo();
        if (!L.length) { cont.style.display = 'block'; cont.textContent = 'El catálogo todavía no ha cargado (o está vacío).'; return; }
        var hallados = L.filter(function (p) { return normBusqueda(p.nombre).indexOf(q) !== -1; });
        cont.style.display = 'block';
        if (!hallados.length) { cont.textContent = 'Sin resultados.'; return; }
        hallados.slice(0, 30).forEach(function (p) {
            var b = document.createElement('button');
            b.type = 'button'; b.className = 'mesa-vinculo-item';
            if (p.imagen) { var im = document.createElement('img'); im.loading = 'lazy'; im.alt = ''; im.src = p.imagen; b.appendChild(im); }
            var sp = document.createElement('span'); sp.textContent = p.nombre;
            var sm = document.createElement('small'); sm.textContent = p.precioNormal ? '$' + p.precioNormal : '';
            sp.appendChild(sm); b.appendChild(sp);
            b.addEventListener('click', function () { asociarProducto(p); });
            cont.appendChild(b);
        });
        if (hallados.length > 30) { var mas = document.createElement('div'); mas.className = 'mesa-vinculo-mas'; mas.textContent = '…y ' + (hallados.length - 30) + ' más. Escribe más letras para acotar.'; cont.appendChild(mas); }
    }
    function asociarProducto(p) {
        if (!S.sel) return;
        S.vinculos[clave(S.sel.r, S.sel.c)] = { n: p.nombre, i: p.imagen || '' };
        $('mesaVinculoBuscar').value = '';
        estado('✔ Celda asociada al producto «' + p.nombre + '».');
        cambioGuardable();
        pintarListaVinculo();
    }
    function quitarVinculo() {
        if (!S.sel) return;
        delete S.vinculos[clave(S.sel.r, S.sel.c)];
        estado('Asociación quitada.');
        cambioGuardable();
    }
    function usarImagenDelProducto() {
        if (!S.sel) return;
        var k = clave(S.sel.r, S.sel.c), p = productoDeVinculo(S.vinculos[k]);
        var url = p ? extraerUrl(p.imagen) : '';
        if (!url) { estado('La imagen de ese producto no es un link de imgbb, no se puede poner en la celda.', true); return; }
        S.celdas[k] = url;
        estado('✔ La celda ahora usa la imagen del producto.');
        cambioGuardable();
    }

    // ── Producto nuevo → celda automática en la Mesa ──
    // Lo llama admin-producto.js justo después de guardar un producto nuevo. Pone la imagen principal (imgbb) en la
    // primera celda libre de la primera mesa cuyo texto contenga su precio original; si ninguna lo tiene, en la última mesa.
    // Se entiende el texto de cada mesa así: un precio («$150») = ese precio exacto; dos con guion o «a» («$100 - $200»)
    // = rango; «hasta $100» = ese precio o menos; «desde $200» / «más de $200» = ese precio o más; varios sueltos = lista.
    function precioCoincide(texto, precio) {
        var t = String(texto || '').toLowerCase().replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
        var nums = [], m, re;
        if (t.indexOf('$') !== -1) { re = /\$\s*(\d+(?:\.\d+)?)/g; while ((m = re.exec(t))) nums.push(parseFloat(m[1])); }
        else { re = /\d+(?:\.\d+)?/g; while ((m = re.exec(t))) nums.push(parseFloat(m[0])); }
        if (!nums.length) return false;
        if (/(hasta|menos de|menor|m[aá]ximo|<)/.test(t)) return precio <= nums[0] + 0.005;
        if (/(desde|a partir|m[aá]s de|mayor|m[ií]nimo|en adelante|\+|>)/.test(t)) return precio >= nums[0] - 0.005;
        if (nums.length === 2 && /\d\s*(?:-|–|—|a|al|hasta|y|to)\s*\$?\s*\d/.test(t)) {
            return precio >= Math.min(nums[0], nums[1]) - 0.005 && precio <= Math.max(nums[0], nums[1]) + 0.005;
        }
        return nums.some(function (n) { return Math.abs(n - precio) < 0.005; });
    }
    function primeraCeldaLibre(num) {
        var mr = Math.floor((num - 1) / MESAS_C), mc = (num - 1) % MESAS_C, r, c;
        for (r = mr * MF; r < (mr + 1) * MF; r++) {
            for (c = mc * MC; c < (mc + 1) * MC; c++) { if (!tieneContenido({ r: r, c: c })) return { r: r, c: c }; }
        }
        return null;
    }
    function asegurarDatos() {
        cargarLocal();
        var p = cargarNube();   // si Firestore tiene algo más reciente, lo trae
        return Promise.race([p, new Promise(function (ok) { setTimeout(ok, 4000); })]);
    }
    window.mesaAgregarProductoNuevo = async function (prod) {
        try {
            var url = extraerUrl(prod && prod.imagenUrl);
            if (!url) return '';
            await asegurarDatos();
            var precio = Number(prod.precioOriginal), total = MESAS_C * MESAS_F, num, celda = null, coincide = false, elegida = 0;
            for (num = 1; num <= total && !celda; num++) {
                var mr = Math.floor((num - 1) / MESAS_C), mc = (num - 1) % MESAS_C;
                if (!isFinite(precio) || !precioCoincide(S.mesas[mr + ',' + mc], precio)) continue;
                coincide = true;
                celda = primeraCeldaLibre(num);
                if (celda) elegida = num;
            }
            var texto;
            if (!celda) {
                celda = primeraCeldaLibre(total); elegida = total;
                if (!celda) return ' · ⚠ No se puso en la Mesa: la mesa ' + total + ' (la última) está llena.';
                texto = coincide
                    ? ' · 📍 Las mesas con el precio $' + precio + ' están llenas: quedó en la última mesa (' + total + ').'
                    : ' · 📍 Ninguna mesa tiene el precio $' + precio + ' en su texto: quedó en la última mesa (' + total + ').';
            } else texto = ' · 📍 También quedó en la mesa ' + elegida + ' de la Mesa.';
            var k = clave(celda.r, celda.c);
            S.celdas[k] = url;
            S.vinculos[k] = { n: String(prod.nombre || ''), i: url };
            guardar();
            if (S.abierta) { pintarPanel(); pedirDibujo(); }
            return texto;
        } catch (e) {
            console.warn('[mesa] no se pudo poner el producto nuevo en la mesa', e);
            return '';
        }
    };

    // ── Seleccionar todas las piezas de la mesa chica elegida ──
    // Marca todas las piezas (3D o vista previa) de la mesa donde está la celda elegida; después,
    // mantén presionada una de ellas y arrastra para moverlas juntas.
    function seleccionarTodasDeMesa() {
        if (!S.sel) { estado('Primero toca una celda de la mesa cuyas piezas quieres seleccionar.', true); return; }
        var ms = mesaDe(S.sel), r0 = ms.mr * MF, c0 = ms.mc * MC, n = 0, r, c;
        var marcadas = {};
        for (r = r0; r < r0 + MF; r++) {
            for (c = c0; c < c0 + MC; c++) {
                if (tieneContenido({ r: r, c: c })) { marcadas[clave(r, c)] = 1; n++; }
            }
        }
        var num = numeroMesa(ms.mr, ms.mc);
        if (!n) { estado('La mesa ' + num + ' no tiene piezas.', true); return; }
        S.multi = marcadas;
        pintarPanel(); pedirDibujo();
        estado('☑ ' + n + (n === 1 ? ' pieza seleccionada' : ' piezas seleccionadas') + ' en la mesa ' + num + '. Mantén presionada una y arrástrala para moverlas juntas (deben caer en celdas vacías).');
    }

    // ── Recorrer una mesa una posición a la derecha ──
    // Las mesas se cuentan de izquierda a derecha y de arriba abajo (1..40). La mesa elegida pasa a la
    // siguiente, la siguiente a la que sigue, y así hasta llegar a la primera mesa vacía (sin piezas, sin vistas
    // previas y sin nombre). Se mueven juntos las piezas, las vistas previas y el texto de cada mesa.
    function mesaVacia(n) {
        var mr = Math.floor((n - 1) / MESAS_C), mc = (n - 1) % MESAS_C, r, c;
        if (S.mesas[mr + ',' + mc]) return false;
        for (r = mr * MF; r < (mr + 1) * MF; r++) {
            for (c = mc * MC; c < (mc + 1) * MC; c++) { if (tieneContenido({ r: r, c: c })) return false; }
        }
        return true;
    }
    function recorrerMesaADerecha() {
        if (!S.sel) { estado('Primero toca una celda de la mesa que quieres recorrer a la derecha.', true); return; }
        var ms = mesaDe(S.sel), ini = numeroMesa(ms.mr, ms.mc), total = MESAS_C * MESAS_F;
        if (mesaVacia(ini)) { estado('La mesa ' + ini + ' está vacía: no hay nada que recorrer.', true); return; }
        var fin = ini + 1;
        while (fin <= total && !mesaVacia(fin)) fin++;
        if (fin > total) {
            estado('No se puede: de la mesa ' + ini + ' a la ' + total + ' no hay ninguna mesa vacía, y la última se saldría de la mesa grande. Libera alguna primero.', true);
            return;
        }
        var msg = fin === ini + 1
            ? 'La mesa ' + ini + ' pasará a la mesa ' + fin + ' (que está vacía), con sus piezas, vistas previas y nombre. ¿Continuar?'
            : 'Se recorrerán las mesas ' + ini + ' a ' + (fin - 1) + ' una posición a la derecha (cada una pasa a la siguiente). La mesa ' + ini + ' quedará vacía y la ' + fin + ' recibirá lo de la ' + (fin - 1) + '. Incluye piezas, vistas previas y nombres. ¿Continuar?';
        if (!window.confirm(msg)) { estado('No se recorrió nada.'); return; }

        function nuevaPos(r, c) {      // posición nueva de una celda (o la misma si su mesa no se mueve)
            var mr = Math.floor(r / MF), mc = Math.floor(c / MC);
            if (mr >= MESAS_F) return r + ',' + c;
            var num = numeroMesa(mr, mc);
            if (num < ini || num >= fin) return r + ',' + c;
            var n2 = num + 1, mr2 = Math.floor((n2 - 1) / MESAS_C), mc2 = (n2 - 1) % MESAS_C;
            return (mr2 * MF + (r - mr * MF)) + ',' + (mc2 * MC + (c - mc * MC));
        }
        function mapear(M) {
            var o = {};
            Object.keys(M).forEach(function (k) { var q = k.split(','); o[nuevaPos(+q[0], +q[1])] = M[k]; });
            return o;
        }
        S.celdas = mapear(S.celdas);
        S.previas = mapear(S.previas);
        S.vinculos = mapear(S.vinculos);
        var nuevasMesas = {};
        Object.keys(S.mesas).forEach(function (k) {
            var q = k.split(','), mr = +q[0], mc = +q[1], num = numeroMesa(mr, mc);
            if (num >= ini && num < fin) {
                var n2 = num + 1;
                nuevasMesas[Math.floor((n2 - 1) / MESAS_C) + ',' + ((n2 - 1) % MESAS_C)] = S.mesas[k];
            } else nuevasMesas[k] = S.mesas[k];
        });
        S.mesas = nuevasMesas;
        S.multi = {};
        estado('✔ Mesas ' + ini + ' a ' + (fin - 1) + ' recorridas a la derecha (ahora ' + (ini + 1) + ' a ' + fin + '). La mesa ' + ini + ' quedó vacía.');
        cambioGuardable();
        clearTimeout(S.hojaTimer);
        S.hojaTimer = setTimeout(sincronizarHoja, 2500);   // copia los nombres nuevos a la hoja de Google
    }

    // ── Desplazamiento automático al arrastrar cerca del borde de la zona visible ──
    function factorBorde(p, largo, borde) {
        if (p < borde) return -Math.min(1, (borde - p) / borde);
        if (p > largo - borde) return Math.min(1, (p - (largo - borde)) / borde);
        return 0;
    }
    function limitarVista() {
        // Evita irse al vacío: el centro de la pantalla se queda dentro de la mesa
        var xmin = -AF * TW / 2 - TW, xmax = AC * TW / 2 + TW, ymin = -(GF / 2 + 1) * TH, ymax = (AC + AF) * TH / 2 + DEPTH + TH;
        var cx = (S.w / 2 - S.ox) / S.scale, cy = (S.h / 2 - S.oy) / S.scale;
        cx = Math.max(xmin, Math.min(xmax, cx)); cy = Math.max(ymin, Math.min(ymax, cy));
        S.ox = S.w / 2 - cx * S.scale; S.oy = S.h / 2 - cy * S.scale;
    }
    function iniciarAutoDesplazamiento() {
        if (S.autoRaf) return;
        var ultimo = 0;
        function paso(ts) {
            S.autoRaf = 0;
            var m = S.mover;
            if (!m || !S.abierta) return;
            var dt = ultimo ? Math.min(ts - ultimo, 50) : 16; ultimo = ts;
            var borde = Math.max(40, Math.min(90, Math.min(S.w, S.h) * 0.14));
            var ax = factorBorde(m.x, S.w, borde), ay = factorBorde(m.y, S.h, borde);
            if (ax || ay) {
                if (!m.t0) m.t0 = ts;
                if (ts - m.t0 >= RETARDO_AUTO) {
                    var v = VEL_AUTO * dt / 1000;
                    S.ox -= ax * v; S.oy -= ay * v;
                    limitarVista();
                    m.hover = celdaEn(m.x, m.y);   // la vista se movió: la celda bajo el cursor cambió
                    pedirDibujo();
                }
            } else m.t0 = 0;
            S.autoRaf = requestAnimationFrame(paso);
        }
        S.autoRaf = requestAnimationFrame(paso);
    }

    // ── Selección de celda ──
    function celdaEn(sx, sy) {
        var wx = (sx - S.ox) / S.scale, wy = (sy - S.oy) / S.scale;
        var c = idxExacto(wy / TH + wx / TW, MC, NC, G), r = idxExacto(wy / TH - wx / TW, MF, NF, GF);
        return (c >= 0 && r >= 0) ? { r: r, c: c } : null;
    }

    function seleccionarEn(sx, sy, teclaMulti) {
        var ce = celdaEn(sx, sy);
        if (S.modoMulti || teclaMulti) {
            if (!ce) return;
            if (!tieneContenido(ce)) { estado('Solo se pueden marcar celdas que tengan una pieza.'); return; }
            var kc = clave(ce.r, ce.c), preagregada = false;
            if (!Object.keys(S.multi).length && S.sel && tieneContenido(S.sel)) { S.multi[clave(S.sel.r, S.sel.c)] = 1; preagregada = (clave(S.sel.r, S.sel.c) === kc); }
            if (!preagregada) { if (S.multi[kc]) delete S.multi[kc]; else S.multi[kc] = 1; }
            var n = Object.keys(S.multi).length;
            estado(n + (n === 1 ? ' pieza seleccionada.' : ' piezas seleccionadas.') + (n > 1 ? ' Mantén presionada una de ellas y arrastra para moverlas juntas.' : ''));
            pintarPanel(); pedirDibujo();
            return;
        }
        S.multi = {};
        S.sel = ce;
        if (ce && TW * S.scale < 40) centrarEn(ce.c, ce.r, 110 / TW);
        pintarPanel();
        pedirDibujo();
    }

    function pintarPanel() {
        var info = $('mesaCeldaInfo'), ed = $('mesaEditor');
        if (!info || !ed) return;
        var nm = Object.keys(S.multi).length, bm = $('mesaMultiBloque');
        if (bm) {
            bm.style.display = (nm || S.modoMulti) ? 'flex' : 'none';
            $('mesaMultiTexto').textContent = '☑ ' + nm + (nm === 1 ? ' pieza seleccionada' : ' piezas seleccionadas') +
                (S.modoMulti ? ' · modo selección múltiple' : '') + (nm > 1 ? ' · mantén presionada una para moverlas juntas' : '');
            $('mesaMultiLimpiar').disabled = !nm;
        }
        if (!S.sel) {
            info.textContent = 'Toca una celda para elegirla. Mantén presionada una pieza para moverla.';
            ed.style.display = 'none';
            $('mesaDescBloque').style.display = 'none';
        } else {
            var url = S.celdas[clave(S.sel.r, S.sel.c)] || '';
            var previa = S.previas[clave(S.sel.r, S.sel.c)] || '';
            info.textContent = 'Fila ' + (S.sel.r + 1) + ' · Columna ' + (S.sel.c + 1) +
                (url ? ' · con 3D' + (previa ? ' (su vista previa ya no se muestra)' : '') : previa ? ' · solo vista previa: falta el 3D' : ' · vacía');
            var ms = mesaDe(S.sel), kms = ms.mr + ',' + ms.mc;
            info.textContent += ' · Mesa ' + numeroMesa(ms.mr, ms.mc);
            $('mesaDescBloque').style.display = 'flex';
            $('mesaDescTitulo').textContent = '📝 Mesa ' + numeroMesa(ms.mr, ms.mc) + ' (fila ' + (ms.mr + 1) + ', columna ' + (ms.mc + 1) + ' de mesas · celdas ' + (ms.mr * MF + 1) + '–' + ((ms.mr + 1) * MF) + ' × ' + (ms.mc * MC + 1) + '–' + ((ms.mc + 1) * MC) + ')';
            if (document.activeElement !== $('mesaDesc')) $('mesaDesc').value = S.mesas[kms] || '';
            $('mesaPreviaUrl').value = previa;
            $('mesaPreviaQuitar').disabled = !previa;
            ed.style.display = 'flex';
            $('mesaUrl').value = url;
            $('mesaQuitar').disabled = !url;
            $('mesaSinFondo').disabled = !url || S.procesando;
            pintarVinculo();
        }
        var total = Object.keys(S.celdas).filter(enRango).length;
        var cont = $('mesaContador');
        var faltan = listaFaltantes().length;
        if (cont) cont.textContent = total + ' / ' + (NC * NF) + (faltan ? ' · ' + faltan + ' sin 3D' : '');
        var bf = $('mesaFaltan');
        if (bf) { bf.textContent = '🔎 Siguiente pieza sin 3D (' + faltan + ')'; bf.disabled = !faltan; }
    }

    // Piezas guardadas en filas que ya no existen (antiguas mesas 41–50): se conservan en los datos pero no se muestran ni se cuentan
    function enRango(k) { return +k.split(',')[0] < NF; }

    function estado(txt, error) {
        var e = $('mesaEstado');
        if (!e) return;
        e.textContent = txt || '';
        e.classList.toggle('error', !!error);
    }

    // ── Poner / quitar imágenes ──
    function extraerUrl(t) { var m = String(t || '').match(RE_UNA); return m ? m[0] : ''; }

    function ponerDesdeCampo() {
        if (!S.sel) return;
        var crudo = $('mesaUrl').value.trim();
        if (!crudo) { estado('Pega un link de imgbb (https://i.ibb.co/...).', true); return; }
        var url = extraerUrl(crudo);
        if (!url) {
            estado(/^https?:\/\/(www\.)?ibb\.co\//i.test(crudo)
                ? 'Ese es el link de la página. En imgbb copia el "Enlace directo" (https://i.ibb.co/...).'
                : 'El link debe ser de imgbb (https://i.ibb.co/...) o una ruta del repo (imagenes/pieza/miniatura.webp)', true);
            return;
        }
        S.celdas[clave(S.sel.r, S.sel.c)] = url;
        estado('✔ Imagen colocada.');
        cambioGuardable();
    }

    // ── Descripción de cada mesa chica: se guarda en el dispositivo, en Firestore y se copia a la hoja de Google ──
    function guardarDescripcion() {
        if (!S.sel) return;
        var ms = mesaDe(S.sel), k = ms.mr + ',' + ms.mc, txt = String($('mesaDesc').value || '').trim().slice(0, 1000);
        if ((S.mesas[k] || '') === txt) return;
        if (txt) S.mesas[k] = txt; else delete S.mesas[k];
        guardar(); pintarPanel(); pedirDibujo();
        clearTimeout(S.hojaTimer);
        S.hojaTimer = setTimeout(sincronizarHoja, 2500);
        estado('✔ Descripción guardada en este dispositivo. Copiando a la hoja de Google…');
    }
    async function sincronizarHoja() {
        var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        if (!user || typeof esCorreoAdmin !== 'function' || !esCorreoAdmin(user)) return;
        if (typeof _postAppsScript !== 'function' || !CONFIG.APPS_SCRIPT_URL) { estado('La descripción quedó guardada aquí, pero falta admin-producto.js o APPS_SCRIPT_URL para copiarla a la hoja.', true); return; }
        try {
            var idToken = await user.getIdToken(true);
            var j = await _postAppsScript({ idToken: idToken, accion: 'mesaDescripciones', mesas: S.mesas });
            if (!j || !j.ok) throw new Error((j && j.error) || 'La hoja no aceptó los datos.');
            estado('✔ Descripción guardada y copiada a la hoja de Google (pestaña «Mesa»).');
        } catch (e) {
            console.error('[mesa] sincronizar hoja', e);
            estado('⚠ Quedó guardada en tu cuenta, pero no se pudo copiar a la hoja: ' + (e && e.message ? e.message : 'error'), true);
        }
    }

    // ── Vista previa: imagen temporal (imgbb) que se muestra mientras la celda no tenga su 3D ──
    function ponerPrevia() {
        if (!S.sel) return;
        var crudo = $('mesaPreviaUrl').value.trim(), k = clave(S.sel.r, S.sel.c);
        if (!crudo) { estado('Pega un link de imgbb (https://i.ibb.co/...) para la vista previa.', true); return; }
        var url = extraerUrl(crudo);
        if (!url) { estado('El link debe ser de imgbb (https://i.ibb.co/...).', true); return; }
        S.previas[k] = url;
        estado(S.celdas[k] ? '✔ Vista previa guardada (esta celda ya tiene 3D, así que no se muestra).' : '✔ Vista previa colocada: se verá hasta que le pongas el 3D.');
        cambioGuardable();
    }
    function quitarPrevia() {
        if (!S.sel) return;
        delete S.previas[clave(S.sel.r, S.sel.c)];
        if (!S.celdas[clave(S.sel.r, S.sel.c)]) delete S.vinculos[clave(S.sel.r, S.sel.c)];
        estado('Vista previa quitada.');
        cambioGuardable();
    }
    // Celdas que solo tienen vista previa (todavía falta hacer su 3D), en orden de fila y columna
    function listaFaltantes() {
        var out = [];
        Object.keys(S.previas).forEach(function (k) {
            if (S.celdas[k] || !enRango(k)) return;
            var p = k.split(',');
            out.push({ r: +p[0], c: +p[1] });
        });
        out.sort(function (a, b) { return a.r - b.r || a.c - b.c; });
        return out;
    }
    function irAFaltante() {
        var l = listaFaltantes();
        if (!l.length) { estado('No hay piezas pendientes: todas las que tienen vista previa ya tienen 3D.'); return; }
        var i = 0;
        if (S.sel) {
            for (var j = 0; j < l.length; j++) {
                if (l[j].r > S.sel.r || (l[j].r === S.sel.r && l[j].c > S.sel.c)) { i = j; break; }
                if (j === l.length - 1) i = 0;
            }
        }
        S.sel = { r: l[i].r, c: l[i].c };
        centrarEn(S.sel.c, S.sel.r, Math.max(S.scale, 0.5));
        estado('Pendiente ' + (i + 1) + ' de ' + l.length + ': fila ' + (S.sel.r + 1) + ', columna ' + (S.sel.c + 1) + '.');
        pintarPanel(); pedirDibujo();
    }

    function quitarSeleccionada() {
        if (!S.sel) return;
        delete S.celdas[clave(S.sel.r, S.sel.c)];
        if (!S.previas[clave(S.sel.r, S.sel.c)]) delete S.vinculos[clave(S.sel.r, S.sel.c)];
        estado('Imagen quitada.');
        cambioGuardable();
    }

    function siguiente(pos) {
        var i = pos.r * NC + pos.c + 1;
        return i < NC * NF ? { r: Math.floor(i / NC), c: i % NC } : null;
    }

    function ponerVarios() {
        if (!S.sel) return;
        var urls = String($('mesaVarios').value || '').match(RE_VARIAS) || [];
        if (!urls.length) { estado('No encontré links de imgbb (https://i.ibb.co/...).', true); return; }
        var pos = { r: S.sel.r, c: S.sel.c }, puestas = 0;
        for (var i = 0; i < urls.length && pos; i++) {
            S.celdas[clave(pos.r, pos.c)] = urls[i];
            puestas++;
            pos = siguiente(pos);
        }
        $('mesaVarios').value = '';
        estado('✔ ' + puestas + ' imagen(es) colocadas' + (puestas < urls.length ? ' (se acabó el espacio de la mesa).' : '.'));
        cambioGuardable();
    }

    async function subirFotos(ev) {
        var input = ev.target;
        var archivos = Array.prototype.slice.call(input.files || []);
        input.value = '';
        if (!archivos.length || !S.sel) return;
        if (S.subiendo) { mostrarToast('Espera a que termine de subir.'); return; }
        if (typeof _leerImagenProducto !== 'function' || typeof _postAppsScript !== 'function' || !CONFIG.APPS_SCRIPT_URL) {
            estado('No se pueden subir fotos desde aquí (falta admin-producto.js o APPS_SCRIPT_URL). Pega el link de imgbb.', true);
            return;
        }
        var user = auth.currentUser;
        if (!esCorreoAdmin(user)) return;
        S.subiendo = true;
        var btn = $('mesaSubir'); if (btn) btn.disabled = true;
        var pos = { r: S.sel.r, c: S.sel.c }, hechas = 0;
        try {
            var idToken = await user.getIdToken(true);
            for (var i = 0; i < archivos.length && pos; i++) {
                estado('⏳ Subiendo foto ' + (i + 1) + '/' + archivos.length + '…');
                var leida = await _leerImagenProducto(archivos[i], 900, 0.85, 0);
                var j = await _postAppsScript({ idToken: idToken, accion: 'subirImagen', imagenBase64: leida.full, nombreArchivo: 'mesa_' + Date.now() + '_' + i + '.jpg' });
                if (!j || !j.ok || !j.url) throw new Error((j && j.error) || 'imgbb no aceptó la foto.');
                S.celdas[clave(pos.r, pos.c)] = j.url;
                hechas++;
                pos = siguiente(pos);
                cambioGuardable();
            }
            estado('✔ ' + hechas + ' foto(s) subidas y colocadas.');
        } catch (e) {
            console.error('[mesa] subir fotos', e);
            estado('❌ ' + (e && e.message ? e.message : 'No se pudo subir la foto.') + (hechas ? ' (' + hechas + ' ya quedaron colocadas)' : ''), true);
        } finally {
            S.subiendo = false;
            if (btn) btn.disabled = false;
        }
    }


    // ── Quitar el fondo y subir la pieza a la OTRA cuenta de imgbb ──
    function cargarImagenEl(src) {
        return new Promise(function (ok, err) {
            var i = new Image();
            i.onload = function () { ok(i); };
            i.onerror = function () { err(new Error('No se pudo leer la imagen.')); };
            i.src = src;
        });
    }
    function canvasABlob(c, tipo, cal) {
        return new Promise(function (ok, err) { c.toBlob(function (b) { b ? ok(b) : err(new Error('No se pudo preparar la imagen.')); }, tipo, cal); });
    }
    function cerrarWorker() {
        clearTimeout(S.workerTimer);
        if (S.worker) { S.worker.terminate(); S.worker = null; }
    }
    function quitarFondoEnWorker(blob) {
        return new Promise(function (ok, err) {
            var w;
            try {
                if (!S.worker) S.worker = new Worker(URL.createObjectURL(new Blob([CODIGO_WORKER], { type: 'text/javascript' })), { type: 'module' });
                w = S.worker;
            } catch (e) { return err(e); }
            clearTimeout(S.workerTimer);
            w.onmessage = function (ev) {
                var d = ev.data || {};
                if (d.progreso) { if (d.tot) estado('⏳ Quitando el fondo… ' + Math.round(d.cur / d.tot * 100) + '% (la primera vez descarga el modelo)'); return; }
                S.workerTimer = setTimeout(cerrarWorker, 120000);
                if (d.ok) ok(d.blob); else { cerrarWorker(); err(new Error(d.error || 'Error al quitar el fondo.')); }
            };
            w.onerror = function (e) { cerrarWorker(); err(new Error((e && e.message) || 'Error al quitar el fondo.')); };
            w.postMessage({ lib: LIB_URL, blob: blob, modelo: MODELO });
        });
    }
    async function quitarFondoEnPagina(blob) {
        var mod = await import(LIB_URL);
        var fn = mod.removeBackground || mod.default;
        return fn(blob, { model: MODELO, progress: function (k, cur, tot) { if (tot) estado('⏳ Quitando el fondo… ' + Math.round(cur / tot * 100) + '%'); } });
    }
    // Recorta los bordes transparentes y limita el tamaño; devuelve un canvas con la pieza sola
    function recortarPieza(img) {
        var w = img.naturalWidth, h = img.naturalHeight;
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var g = c.getContext('2d'); g.drawImage(img, 0, 0);
        var d = g.getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        }
        if (x1 < x0 || y1 < y0) throw new Error('No se detectó ninguna pieza en la imagen.');
        var pad = Math.round(Math.max(x1 - x0, y1 - y0) * 0.03);
        x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
        var cw = x1 - x0 + 1, ch = y1 - y0 + 1, k = Math.min(1, MAX_LADO_SALIDA / Math.max(cw, ch));
        var o = document.createElement('canvas'); o.width = Math.round(cw * k); o.height = Math.round(ch * k);
        o.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, o.width, o.height);
        return o;
    }

    async function quitarFondoSeleccionada() {
        if (!S.sel || S.procesando || S.subiendo) return;
        var k = clave(S.sel.r, S.sel.c), url = S.celdas[k];
        if (!url) { estado('Esta celda no tiene imagen.', true); return; }
        if (typeof _postAppsScript !== 'function' || !CONFIG.APPS_SCRIPT_URL) { estado('Falta admin-producto.js o APPS_SCRIPT_URL.', true); return; }
        var user = auth.currentUser;
        if (!esCorreoAdmin(user)) return;
        S.procesando = true; S.subiendo = true;
        $('mesaSinFondo').disabled = true;
        try {
            estado('⏳ Descargando la imagen…');
            var resp = await fetch(url, { mode: 'cors' });
            if (!resp.ok) throw new Error('No se pudo descargar la imagen (HTTP ' + resp.status + ').');
            var orig = await cargarImagenEl(URL.createObjectURL(await resp.blob()));
            var f = Math.min(1, MAX_LADO_FOTO / Math.max(orig.naturalWidth, orig.naturalHeight));
            var cc = document.createElement('canvas'); cc.width = Math.round(orig.naturalWidth * f); cc.height = Math.round(orig.naturalHeight * f);
            cc.getContext('2d').drawImage(orig, 0, 0, cc.width, cc.height);
            var ligera = await canvasABlob(cc, 'image/jpeg', 0.92);

            var res;
            try { res = await quitarFondoEnWorker(ligera); }
            catch (e1) { console.warn('[mesa] worker falló, se usa la página:', e1); res = await quitarFondoEnPagina(ligera); }
            var pieza = recortarPieza(await cargarImagenEl(URL.createObjectURL(res)));

            estado('⏳ Subiendo la pieza a la otra cuenta de imgbb…');
            var idToken = await user.getIdToken(true);
            var j = await _postAppsScript({ idToken: idToken, accion: 'subirImagenMesa', imagenBase64: pieza.toDataURL('image/png'), nombreArchivo: 'mesa_pieza_' + Date.now() + '.png' });
            if (!j || !j.ok || !j.url) throw new Error((j && j.error) || 'imgbb no aceptó la imagen.');
            S.celdas[k] = j.url;
            estado('✔ Listo: la celda ahora usa la pieza sin fondo.');
            cambioGuardable();
        } catch (e) {
            console.error('[mesa] quitar fondo', e);
            var msg = e && e.message ? e.message : 'No se pudo procesar la imagen.';
            if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'El navegador no pudo descargar la imagen (CORS o sin internet).';
            estado('❌ ' + msg, true);
        } finally {
            S.procesando = false; S.subiendo = false;
            pintarPanel();
        }
    }

    function vaciarMesa() {
        var total = Object.keys(S.celdas).length + Object.keys(S.previas).length;
        if (!total) { estado('La mesa ya está vacía.'); return; }
        if (!window.confirm('¿Quitar las ' + total + ' imágenes de la mesa (3D y vistas previas)? Esto no se puede deshacer.')) return;
        S.celdas = {}; S.previas = {}; S.vinculos = {}; S.multi = {};
        estado('Mesa vaciada.');
        cambioGuardable();
    }

    function cambioGuardable() {
        pintarPanel();
        pedirDibujo();
        guardar();
    }

    // ── Guardado: este dispositivo + Firestore (si está permitido) ──
    function claveLocal() {
        var u = (typeof auth !== 'undefined') ? auth.currentUser : null;
        return CLAVE + (u ? u.uid : 'anon');
    }

    function cargarLocal() {
        try {
            var o = JSON.parse(localStorage.getItem(claveLocal()) || 'null');
            if (o && (o.celdas || o.previas || o.mesas)) {
                var n = normalizarDatos(o.celdas, o.previas, o.mesas, o.disp);
                S.celdas = n.celdas; S.previas = n.previas; S.mesas = n.mesas; S.vinculos = (o.vinculos && typeof o.vinculos === 'object') ? o.vinculos : {}; S.ts = o.ts || 0;
                if ((o.disp || 1) < DISPOSICION) localStorage.setItem(claveLocal(), JSON.stringify({ ts: S.ts, disp: DISPOSICION, celdas: S.celdas, previas: S.previas, mesas: S.mesas, vinculos: S.vinculos }));   // ya queda guardado con la disposición nueva
            }
        } catch (e) { /* sin datos guardados: se empieza vacía */ }
    }

    function guardar() {
        S.ts = Date.now();
        try { localStorage.setItem(claveLocal(), JSON.stringify({ ts: S.ts, disp: DISPOSICION, celdas: S.celdas, previas: S.previas, mesas: S.mesas, vinculos: S.vinculos })); } catch (e) { console.warn('[mesa] no se pudo guardar localmente', e); }
        clearTimeout(S.nubeTimer);
        S.nubeTimer = setTimeout(guardarNube, 1500);
    }

    function refNube() {
        try {
            var u = (typeof auth !== 'undefined') ? auth.currentUser : null;
            if (!u || typeof firebase === 'undefined' || !firebase.firestore) return null;
            return firebase.firestore().collection('usuarios').doc(u.uid).collection('mesa').doc('tablero');
        } catch (e) { return null; }
    }

    function guardarNube() {
        var ref = refNube();
        if (!ref) return;
        ref.set({ ts: S.ts, total: Object.keys(S.celdas).length, datos: JSON.stringify(S.celdas), previas: JSON.stringify(S.previas), mesas: JSON.stringify(S.mesas), vinculos: JSON.stringify(S.vinculos), disp: DISPOSICION })
            .then(function () { S.nubeOk = true; })
            .catch(function (e) { S.nubeOk = false; console.warn('[mesa] no se pudo sincronizar con Firestore:', e); });
    }

    function cargarNube() {
        var ref = refNube();
        if (!ref) return Promise.resolve();
        return ref.get().then(function (doc) {
            if (!doc.exists) { if (Object.keys(S.celdas).length || Object.keys(S.previas).length || Object.keys(S.mesas).length) guardarNube(); return; }
            var d = doc.data() || {};
            if ((d.ts || 0) > S.ts && d.datos) {
                try {
                    var n = normalizarDatos(JSON.parse(d.datos), d.previas ? JSON.parse(d.previas) : {}, d.mesas ? JSON.parse(d.mesas) : {}, d.disp);
                    S.celdas = n.celdas; S.previas = n.previas; S.mesas = n.mesas; S.vinculos = d.vinculos ? JSON.parse(d.vinculos) : {}; S.ts = d.ts;
                    localStorage.setItem(claveLocal(), JSON.stringify({ ts: S.ts, disp: DISPOSICION, celdas: S.celdas, previas: S.previas, mesas: S.mesas, vinculos: S.vinculos }));
                    pintarPanel(); pedirDibujo();
                } catch (e) { console.warn('[mesa] datos de la nube dañados', e); }
            } else if (S.ts > (d.ts || 0)) {
                guardarNube();
            }
        }).catch(function (e) { console.warn('[mesa] no se pudo leer Firestore:', e); });
    }

    // ── Carga de imágenes: miniaturas siempre, completas solo muy de cerca ──
    function pedir(url, completa) {
        var k = (completa ? 'F' : 'T') + url;
        if (S.vuelo[k] || S.fallo[url]) return;
        S.pend.push({ url: url, completa: completa, k: k });
    }

    function bombear() {
        while (S.enVuelo < 6 && S.pend.length) cargarItem(S.pend.shift());
    }

    function cargarItem(it) {
        if (S.vuelo[it.k]) return;
        S.vuelo[it.k] = 1; S.enVuelo++;
        var im = new Image();
        im.onload = function () {
            S.enVuelo--; delete S.vuelo[it.k];
            if (!S.thumb[it.url]) S.thumb[it.url] = hacerThumb(im);
            if (it.completa) {
                S.full[it.url] = im; S.fullOrden.push(it.url);
                while (S.fullOrden.length > MAX_COMPLETAS) delete S.full[S.fullOrden.shift()];
            }
            pedirDibujo();
        };
        im.onerror = function () {
            S.enVuelo--; delete S.vuelo[it.k]; S.fallo[it.url] = 1;
            pedirDibujo();
        };
        im.src = it.url;
    }

    function hacerThumb(im) {
        var iw = im.naturalWidth || 1, ih = im.naturalHeight || 1;
        var s = Math.min(1, 160 / Math.max(iw, ih));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(iw * s)); c.height = Math.max(1, Math.round(ih * s));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        return c;
    }

    // ── Dibujo ──
    function pedirDibujo() {
        if (S.abierta && !S.raf) S.raf = requestAnimationFrame(dibujar);
    }

    function poli(ctx, pts, relleno) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = relleno; ctx.fill();
    }

    function dibujar() {
        S.raf = 0;
        if (!S.abierta || !cv) return;
        var ctx = cv.getContext('2d'), k = S.scale;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.setTransform(S.dpr * k, 0, 0, S.dpr * k, S.dpr * S.ox, S.dpr * S.oy);
        S.pend.length = 0;
        dibujarMesa(ctx, k);
        dibujarRejilla(ctx, k);
        dibujarDescripciones(ctx, k);
        dibujarImagenes(ctx);
        dibujarMulti(ctx, k);
        dibujarSeleccion(ctx, k);
        dibujarMovimiento(ctx, k);
        bombear();
    }

    // Cada mesa chica es su propia tabla, con su marco, separada de las demás por un hueco del "infinito" oscuro
    function dibujarMesa(ctx, k) {
        for (var mr = 0; mr < MESAS_F; mr++) {
            for (var mc = 0; mc < MESAS_C; mc++) {
                var x0 = mc * (MC + G), x1 = x0 + MC, y0 = mr * (MF + GF), y1 = y0 + MF;
                var A = proj(x0, y0), B = proj(x1, y0), C = proj(x1, y1), D = proj(x0, y1);
                poli(ctx, [D, C, [C[0], C[1] + DEPTH], [D[0], D[1] + DEPTH]], '#070708');          // costado izquierdo
                poli(ctx, [C, B, [B[0], B[1] + DEPTH], [C[0], C[1] + DEPTH]], '#101013');          // costado derecho
                poli(ctx, [A, B, C, D], '#121216');                                                // cara superior
                ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]); ctx.closePath();
                ctx.strokeStyle = 'rgba(245,196,107,0.75)'; ctx.lineWidth = Math.max(2.4 / k, 1.6); ctx.lineJoin = 'round'; ctx.stroke();   // marco
            }
        }
    }
    // Rejilla fina dentro de cada mesa (el marco ya lo dibuja dibujarMesa)
    function dibujarRejilla(ctx, k) {
        if (TW * k < 8) return;   // muy alejado: solo se ven los marcos
        ctx.beginPath();
        for (var mr = 0; mr < MESAS_F; mr++) {
            for (var mc = 0; mc < MESAS_C; mc++) {
                var x0 = mc * (MC + G), y0 = mr * (MF + GF), i, a, b;
                for (i = 1; i < MC; i++) { a = proj(x0 + i, y0); b = proj(x0 + i, y0 + MF); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
                for (i = 1; i < MF; i++) { a = proj(x0, y0 + i); b = proj(x0 + MC, y0 + i); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
            }
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1 / k; ctx.stroke();
    }

    // Parte un texto en máximo "maxLineas" renglones que quepan en "ancho" (con la fuente ya puesta en ctx); agrega … si se corta
    function partirTexto(ctx, texto, ancho, maxLineas) {
        var palabras = String(texto).replace(/\s+/g, ' ').trim().split(' '), lineas = [], actual = '';
        for (var i = 0; i < palabras.length; i++) {
            var prueba = actual ? actual + ' ' + palabras[i] : palabras[i];
            if (ctx.measureText(prueba).width <= ancho || !actual) actual = prueba;
            else { lineas.push(actual); actual = palabras[i]; if (lineas.length === maxLineas) break; }
        }
        if (lineas.length < maxLineas && actual) lineas.push(actual);
        var cortado = lineas.join(' ').length < palabras.join(' ').length;
        var ult = lineas.length - 1;
        if (ult >= 0 && (cortado || ctx.measureText(lineas[ult]).width > ancho)) {
            var t = lineas[ult];
            while (t.length > 1 && ctx.measureText(t + '…').width > ancho) t = t.slice(0, -1);
            lineas[ult] = t.replace(/\s+$/, '') + '…';
        }
        return lineas;
    }

    // La descripción de cada mesa se escribe "pintada en el piso", en el hueco de arriba, pegada a su mesa, dentro de un
    // recuadro amarillo delgado que sale del borde de la mesa (comparte con ella el lado de abajo y el mismo ancho)
    function dibujarDescripciones(ctx, k) {
        if (TW * k < 5) return;   // muy alejado: sería ilegible
        var tam = 125, lh = 145, pad = 50;   // letra de 1.25 celdas de alto; renglón de 1.45; margen del recuadro (en 1/100 de celda)
        ctx.save();
        ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#ffffff';
        for (var mr = 0; mr < MESAS_F; mr++) {
            for (var mc = 0; mc < MESAS_C; mc++) {
                var texto = S.mesas[mr + ',' + mc];
                if (!texto) continue;
                var xa = mc * (MC + G), ya = mr * (MF + GF);
                var o = proj(xa, ya), alto;
                ctx.save();
                ctx.transform(TW / 2, TH / 2, -TW / 2, TH / 2, o[0], o[1]);   // el plano del piso: 1 unidad = 1 celda
                ctx.scale(0.01, 0.01);                                       // ahora 1 unidad = 1/100 de celda
                ctx.font = '600 ' + tam + 'px Segoe UI, system-ui, sans-serif';
                var lineas = partirTexto(ctx, texto, MC * 100 - 60, 3);
                alto = lineas.length * lh + pad;                              // alto del recuadro, en 1/100 de celda
                lineas.forEach(function (ln, i) { ctx.fillText(ln, MC * 50, -alto / 2 - (lineas.length - 1) * lh / 2 + i * lh + tam * 0.35); });
                ctx.restore();
                // Recuadro: tres lados (izquierdo, de arriba y derecho); el cuarto es el borde de la mesa
                var h = alto / 100;
                var D = proj(xa, ya), A = proj(xa, ya - h), B = proj(xa + MC, ya - h), C = proj(xa + MC, ya);
                ctx.beginPath(); ctx.moveTo(D[0], D[1]); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]);
                ctx.strokeStyle = 'rgba(245,196,107,0.75)'; ctx.lineWidth = Math.max(1.5 / k, 0.8); ctx.lineJoin = 'miter'; ctx.stroke();
            }
        }
        ctx.restore();
    }
    function rangoVisible() {
        var esq = [[0, 0], [S.w, 0], [S.w, S.h], [0, S.h]];
        var c0 = 1e9, c1 = -1e9, r0 = 1e9, r1 = -1e9;
        esq.forEach(function (p) {
            var wx = (p[0] - S.ox) / S.scale, wy = (p[1] - S.oy) / S.scale;
            var c = wy / TH + wx / TW, r = wy / TH - wx / TW;
            if (c < c0) c0 = c; if (c > c1) c1 = c;
            if (r < r0) r0 = r; if (r > r1) r1 = r;
        });
        return {
            c0: Math.max(0, idxLimite(Math.floor(c0), MC, NC, 'ini', G)), c1: Math.min(NC - 1, idxLimite(Math.ceil(c1), MC, NC, 'fin', G)),
            r0: Math.max(0, idxLimite(Math.floor(r0), MF, NF, 'ini', GF)), r1: Math.min(NF - 1, idxLimite(Math.ceil(r1), MF, NF, 'fin', GF))
        };
    }
    // Dibuja una imagen acostada sobre la celda (r, c), ajustada con un pequeño margen
    function dibujarSprite(ctx, src, iw, ih, r, c) {
        var o = pc(c, r), s = 0.94 / Math.max(iw, ih);
        var u0 = (1 - iw * s) / 2, v0 = (1 - ih * s) / 2;
        var exx = TW / 2, exy = TH / 2, eyx = -TW / 2, eyy = TH / 2;
        ctx.save();
        ctx.transform(exx * s, exy * s, eyx * s, eyy * s, o[0] + exx * u0 + eyx * v0, o[1] + exy * u0 + eyy * v0);
        ctx.drawImage(src, 0, 0);
        ctx.restore();
    }

    // Dibuja una pieza "de pie" sobre la celda (r, c): charco de luz en el piso, sombra de contacto y la
    // imagen parada con la base en el suelo. Se dibujan de atrás hacia adelante para que se tapen bien.
    function dibujarFigura(ctx, src, iw, ih, r, c) {
        var o = pc(c, r), cx = o[0], cy = o[1] + TH / 2;
        var s = Math.min(TW * 0.92 / iw, TW * 1.25 / ih), w = iw * s, h = ih * s;
        var pie = cy + TH * 0.14;
        var g;
        // charco de luz sobre la mesa (elipse en perspectiva)
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(1, TH / TW);
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, TW * 0.52);
        g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, TW * 0.52, 0, 6.2832); ctx.fill();
        ctx.restore();
        // sombra de contacto bajo la base
        ctx.save();
        ctx.translate(cx, pie); ctx.scale(1, 0.32);
        var rr = Math.max(w * 0.5, TW * 0.22);
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
        g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rr, 0, 6.2832); ctx.fill();
        ctx.restore();
        // la pieza, parada
        ctx.drawImage(src, cx - w / 2, pie - h, w, h);
    }

    // Contorno ámbar punteado en el piso de las celdas que solo tienen vista previa
    function marcarPrevia(ctx, r, c) {
        var p = pc(c, r), k = S.scale;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + TW / 2, p[1] + TH / 2);
        ctx.lineTo(p[0], p[1] + TH); ctx.lineTo(p[0] - TW / 2, p[1] + TH / 2); ctx.closePath();
        ctx.fillStyle = 'rgba(245,166,35,0.12)'; ctx.fill();
        ctx.setLineDash([5 / k, 4 / k]);
        ctx.strokeStyle = '#f5a623'; ctx.lineWidth = Math.max(2 / k, 1.2); ctx.stroke();
        ctx.setLineDash([]);
    }

    // Prisma triangular para las imágenes de imgbb: la base es un triángulo sobre la mesa con su lado ANCHO
    // al frente (hacia ti) y la punta atrás. La imagen va en la cara ancha; arriba se ve la tapa triangular.
    function dibujarPrisma(ctx, src, iw, ih, r, c) {
        var o = pc(c, r), cx = o[0], cy = o[1] + TH / 2, k = S.scale;
        var s = Math.min(TW * 0.92 / iw, TW * 1.25 / ih), w = iw * s, h = ih * s;
        var yF = cy + TH * 0.16, yA = cy - TH * 0.28;          // borde ancho (frente) y punta (atrás), en el piso
        var xi = cx - w / 2, xd = cx + w / 2, g;
        // charco de luz bajo el prisma
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(1, TH / TW);
        g = ctx.createRadialGradient(0, 0, 0, 0, 0, TW * 0.56);
        g.addColorStop(0, 'rgba(245,200,120,0.22)'); g.addColorStop(1, 'rgba(245,200,120,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, TW * 0.56, 0, 6.2832); ctx.fill();
        ctx.restore();
        // base triangular en el piso (sombra de contacto)
        poli(ctx, [[xi, yF], [xd, yF], [cx, yA]], 'rgba(0,0,0,0.55)');
        // cara trasera izquierda y derecha: se asoman un poco a los lados de la imagen, más oscuras
        poli(ctx, [[xi, yF], [cx, yA], [cx, yA - h], [xi, yF - h]], '#1c1c24');
        poli(ctx, [[xd, yF], [cx, yA], [cx, yA - h], [xd, yF - h]], '#24242d');
        // cara ancha con la imagen (mira hacia ti)
        ctx.drawImage(src, xi, yF - h, w, h);
        // tapa triangular (se ve desde arriba)
        g = ctx.createLinearGradient(0, yA - h, 0, yF - h);
        g.addColorStop(0, '#e9e2da'); g.addColorStop(1, '#bdb4aa');
        poli(ctx, [[xi, yF - h], [xd, yF - h], [cx, yA - h]], g);
        // bordes resaltados
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(1.4 / k, 0.9);
        ctx.strokeStyle = '#f5c46b';
        ctx.beginPath(); ctx.moveTo(xi, yF); ctx.lineTo(xi, yF - h); ctx.lineTo(xd, yF - h); ctx.lineTo(xd, yF); ctx.closePath(); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath(); ctx.moveTo(xi, yF - h); ctx.lineTo(cx, yA - h); ctx.lineTo(xd, yF - h); ctx.stroke();
    }
    function esDeImgbb(url) { return /^https:\/\/i\.ibb\.co\//i.test(url || ''); }

    function dibujarImagenes(ctx) {
        var rg = rangoVisible(), cw = TW * S.scale, enPie = [];
        for (var r = rg.r0; r <= rg.r1; r++) {
            for (var c = rg.c0; c <= rg.c1; c++) {
                var kc = clave(r, c), url = S.celdas[kc], esPrevia = false;
                if (!url) { url = S.previas[kc]; esPrevia = !!url; }
                if (!url) continue;
                if (S.mover && ((S.mover.desde.r === r && S.mover.desde.c === c) || (S.mover.set && S.mover.set[kc]))) continue;   // la pieza levantada se dibuja siguiendo el dedo
                if (esPrevia) marcarPrevia(ctx, r, c);
                var th = S.thumb[url], full = S.full[url];
                var src = null;
                if (cw > UMBRAL_COMPLETA) {
                    if (full) src = full;
                    else if (!S.fallo[url]) pedir(url, true);
                }
                if (!src && th) src = th;
                if (!th && !full && cw >= UMBRAL_CARGA && !S.fallo[url]) pedir(url, false);

                if (src) {
                    if (S.vista3d) enPie.push({ src: src, r: r, c: c, previa: esPrevia, prisma: esDeImgbb(url) });
                    else {
                        dibujarSprite(ctx, src, src.naturalWidth || src.width, src.naturalHeight || src.height, r, c);
                        ctx.globalAlpha = 1;
                    }
                } else {
                    var p = pc(c, r);
                    poli(ctx, [p, [p[0] + TW / 2, p[1] + TH / 2], [p[0], p[1] + TH], [p[0] - TW / 2, p[1] + TH / 2]],
                         S.fallo[url] ? '#5a2a30' : '#3b4a63');
                }
            }
        }
        if (enPie.length) {
            enPie.sort(function (a, b) { return (a.r + a.c) - (b.r + b.c) || a.r - b.r; });
            enPie.forEach(function (f) {
                // (la vista previa ya no se dibuja semitransparente: se distingue por su contorno ámbar en el piso)
                (f.prisma ? dibujarPrisma : dibujarFigura)(ctx, f.src, f.src.naturalWidth || f.src.width, f.src.naturalHeight || f.src.height, f.r, f.c);
                ctx.globalAlpha = 1;
            });
        }
    }


    // Mientras se arrastra una pieza: celda de origen, celda destino y la pieza siguiendo el dedo
    function dibujarMovimiento(ctx, k) {
        var m = S.mover; if (!m) return;
        if (m.grupo) { dibujarMovimientoGrupo(ctx, k); return; }
        function rombo(ce, relleno, borde, punteado) {
            var p = pc(ce.c, ce.r);
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + TW / 2, p[1] + TH / 2);
            ctx.lineTo(p[0], p[1] + TH); ctx.lineTo(p[0] - TW / 2, p[1] + TH / 2); ctx.closePath();
            ctx.fillStyle = relleno; ctx.fill();
            ctx.setLineDash(punteado ? [5 / k, 4 / k] : []);
            ctx.strokeStyle = borde; ctx.lineWidth = Math.max(2.5 / k, 1.5); ctx.stroke();
            ctx.setLineDash([]);
        }
        rombo(m.desde, 'rgba(255,255,255,0.06)', '#9a9aa8', true);
        if (m.hover && (m.hover.r !== m.desde.r || m.hover.c !== m.desde.c)) {
            var ocupada = tieneContenido(m.hover);
            rombo(m.hover, ocupada ? 'rgba(245,166,35,0.30)' : 'rgba(80,200,120,0.30)', ocupada ? '#f5a623' : '#50c878', false);
        }
        var kd = clave(m.desde.r, m.desde.c), url = S.celdas[kd] || S.previas[kd];
        var src = url ? (S.full[url] || S.thumb[url]) : null;
        var wx = (m.x - S.ox) / S.scale, wy = (m.y - S.oy) / S.scale;
        if (src) {
            var iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
            var e = Math.min(TW * 0.92 / iw, TW * 1.25 / ih), w = iw * e, h = ih * e;
            ctx.save(); ctx.globalAlpha = 0.85;
            ctx.drawImage(src, wx - w / 2, wy - h * 0.7, w, h);
            ctx.restore();
        } else {
            ctx.beginPath(); ctx.arc(wx, wy, TW * 0.18, 0, 6.2832); ctx.fillStyle = 'rgba(232,96,122,0.8)'; ctx.fill();
        }
    }

    // Piezas marcadas con la selección múltiple
    function dibujarMulti(ctx, k) {
        if (S.mover && S.mover.grupo) return;
        var claves = Object.keys(S.multi); if (!claves.length) return;
        var rg = rangoVisible();
        claves.forEach(function (kc) {
            var q = kc.split(','), r = +q[0], c = +q[1];
            if (r < rg.r0 || r > rg.r1 || c < rg.c0 || c > rg.c1) return;
            var p = pc(c, r);
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + TW / 2, p[1] + TH / 2);
            ctx.lineTo(p[0], p[1] + TH); ctx.lineTo(p[0] - TW / 2, p[1] + TH / 2); ctx.closePath();
            ctx.fillStyle = 'rgba(74,168,255,0.30)'; ctx.fill();
            ctx.strokeStyle = '#4aa8ff'; ctx.lineWidth = Math.max(2.5 / k, 1.5); ctx.stroke();
        });
    }

    // Mientras se arrastra un grupo: celdas de origen, celdas de destino (verde = libre, rojo = no cabe) y las piezas siguiendo el cursor
    function dibujarMovimientoGrupo(ctx, k) {
        var m = S.mover;
        function rombo(ce, relleno, borde, punteado) {
            var p = pc(ce.c, ce.r);
            ctx.beginPath();
            ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + TW / 2, p[1] + TH / 2);
            ctx.lineTo(p[0], p[1] + TH); ctx.lineTo(p[0] - TW / 2, p[1] + TH / 2); ctx.closePath();
            ctx.fillStyle = relleno; ctx.fill();
            ctx.setLineDash(punteado ? [5 / k, 4 / k] : []);
            ctx.strokeStyle = borde; ctx.lineWidth = Math.max(2.5 / k, 1.5); ctx.stroke();
            ctx.setLineDash([]);
        }
        m.grupo.forEach(function (g) { rombo(g, 'rgba(255,255,255,0.06)', '#9a9aa8', true); });
        if (m.hover && (m.hover.r !== m.desde.r || m.hover.c !== m.desde.c)) {
            var plan = planGrupo(m, m.hover);
            plan.destinos.forEach(function (d) {
                var mal = !plan.ok && (d.ocupada || plan.fuera);
                rombo(d, mal ? 'rgba(224,80,80,0.30)' : 'rgba(80,200,120,0.30)', mal ? '#e05050' : '#50c878', false);
            });
        }
        var wx = (m.x - S.ox) / S.scale, wy = (m.y - S.oy) / S.scale;
        m.grupo.forEach(function (g) {
            var kg = clave(g.r, g.c), url = S.celdas[kg] || S.previas[kg];
            var src = url ? (S.full[url] || S.thumb[url]) : null;
            var gx = wx + (g.dc - g.dr) * TW / 2, gy = wy + (g.dc + g.dr) * TH / 2;
            if (src) {
                var iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height;
                var e = Math.min(TW * 0.92 / iw, TW * 1.25 / ih), w = iw * e, h = ih * e;
                ctx.save(); ctx.globalAlpha = 0.85;
                ctx.drawImage(src, gx - w / 2, gy - h * 0.7, w, h);
                ctx.restore();
            } else {
                ctx.beginPath(); ctx.arc(gx, gy, TW * 0.18, 0, 6.2832); ctx.fillStyle = 'rgba(232,96,122,0.8)'; ctx.fill();
            }
        });
    }

    function dibujarSeleccion(ctx, k) {
        if (!S.sel) return;
        var mr = Math.floor(S.sel.r / MF), mc = Math.floor(S.sel.c / MC);
        var xa = mc * (MC + G), ya = mr * (MF + GF);
        var q0 = proj(xa, ya), q1 = proj(xa + MC, ya), q2 = proj(xa + MC, ya + MF), q3 = proj(xa, ya + MF);
        ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.lineTo(q3[0], q3[1]); ctx.closePath();
        ctx.fillStyle = 'rgba(245,196,107,0.05)'; ctx.fill();
        ctx.strokeStyle = 'rgba(245,196,107,0.9)'; ctx.lineWidth = Math.max(2.5 / k, 1.5); ctx.stroke();
        var p = pc(S.sel.c, S.sel.r);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + TW / 2, p[1] + TH / 2);
        ctx.lineTo(p[0], p[1] + TH); ctx.lineTo(p[0] - TW / 2, p[1] + TH / 2); ctx.closePath();
        ctx.strokeStyle = '#e8607a'; ctx.lineWidth = Math.max(2.5 / k, 1.5); ctx.stroke();
    }
})();
