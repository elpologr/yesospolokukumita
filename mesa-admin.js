// ══════════════════════════════════════════════════════════════════════════════
// YESOS POLO KUKÚMITA — Mesa (solo administradores)
// Se carga DESPUÉS de app.js y admin-producto.js (usa: auth, esCorreoAdmin, mostrarToast, CONFIG,
// y, para subir fotos, _leerImagenProducto y _postAppsScript de admin-producto.js).
//
// Una mesa negra en vista isométrica con una cuadrícula de 100×100 celdas (10,000 espacios).
// Cada celda puede llevar una imagen de imgbb (link https://i.ibb.co/...), pegando el link, pegando
// varios links de golpe o subiendo fotos (se suben a imgbb por el Apps Script, igual que en "Agregar producto").
//
// Se dibuja en <canvas> (10,000 elementos HTML serían demasiado pesados). Para cuidar la memoria,
// de cada imagen se guarda una miniatura y solo se cargan las que están a la vista.
// Se guarda en este dispositivo (localStorage) y, si Firestore lo permite, también en
// usuarios/{uid}/mesa/tablero (esa ruta ya está permitida por las reglas actuales).
//
// El botón del perfil solo se muestra a los correos de CONFIG.CORREOS_ADMIN. Esto es solo una vista
// privada: no hay nada que el servidor deba proteger (no toca la hoja de productos).
// ══════════════════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    var N = 100;                 // celdas por lado
    var TW = 80, TH = 40;        // ancho y alto de una celda en pantalla (proyección isométrica 2:1)
    var M = 1.5;                 // margen de la mesa alrededor de la cuadrícula (en celdas)
    var DEPTH = 40, LEG = 300;   // grosor del tablero y largo de las patas
    var CLAVE = 'polo_mesa_v1_';
    var MAX_ESCALA = 4;
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
    var RE_UNA = /https:\/\/i\.ibb\.co\/[^\s,"'<>\[\]()]+/i;
    var RE_VARIAS = /https:\/\/i\.ibb\.co\/[^\s,"'<>\[\]()]+/gi;

    var S = {
        celdas: {}, ts: 0, sel: null,
        scale: 0.05, ox: 0, oy: 0, w: 0, h: 0, dpr: 1, minEscala: 0.03, fitEscala: 0.05,
        raf: 0, abierta: false, ajustada: false,
        thumb: {}, full: {}, fullOrden: [], fallo: {}, vuelo: {}, pend: [], enVuelo: 0,
        nubeTimer: null, nubeOk: null, subiendo: false, procesando: false, worker: null, workerTimer: null
    };
    var root = null, cv = null;

    function $(id) { return document.getElementById(id); }
    function proj(c, r) { return [(c - r) * TW / 2, (c + r) * TH / 2]; }
    function clave(r, c) { return r + ',' + c; }

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
                '</div>' +
            '</div>' +
            '<div class="mesa-panel">' +
                '<div class="mesa-celda-info" id="mesaCeldaInfo">Toca una celda de la mesa para elegirla.</div>' +
                '<div id="mesaEditor" style="display:none; flex-direction:column; gap:10px;">' +
                    '<div class="mesa-fila">' +
                        '<input id="mesaUrl" class="mesa-input" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://i.ibb.co/...">' +
                        '<button class="mesa-btn principal" type="button" id="mesaPoner">Poner</button>' +
                    '</div>' +
                    '<div class="mesa-fila">' +
                        '<button class="mesa-btn" type="button" id="mesaSubir">📷 Subir fotos</button>' +
                        '<button class="mesa-btn peligro" type="button" id="mesaQuitar">Quitar imagen</button>' +
                    '</div>' +
                    '<button class="mesa-btn" type="button" id="mesaSinFondo">✂️ Quitar fondo y subir a la otra cuenta</button>' +
                    '<input type="file" id="mesaArchivos" accept="image/*" multiple style="display:none">' +
                    '<details class="mesa-detalle">' +
                        '<summary>Pegar varios links de imgbb</summary>' +
                        '<textarea id="mesaVarios" class="mesa-input" rows="4" placeholder="Un link por línea. Se colocan desde la celda elegida hacia la derecha y siguen en la fila de abajo."></textarea>' +
                        '<button class="mesa-btn" type="button" id="mesaPonerVarios">Colocar links</button>' +
                    '</details>' +
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
        $('mesaPoner').addEventListener('click', ponerDesdeCampo);
        $('mesaUrl').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ponerDesdeCampo(); } });
        $('mesaQuitar').addEventListener('click', quitarSeleccionada);
        $('mesaSinFondo').addEventListener('click', quitarFondoSeleccionada);
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
        var bw = (N + 2 * M) * TW;
        var yArriba = -M * TH, yAbajo = (N + M) * TH + DEPTH + LEG;
        var k = Math.min(S.w * 0.94 / bw, S.h * 0.94 / (yAbajo - yArriba));
        S.fitEscala = k; S.minEscala = k * 0.7;
        S.scale = k;
        S.ox = S.w / 2;
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
        var p = proj(c + 0.5, r + 0.5);
        S.scale = Math.max(S.minEscala, Math.min(MAX_ESCALA, escala));
        S.ox = S.w / 2 - p[0] * S.scale;
        S.oy = S.h / 2 - p[1] * S.scale;
    }

    // ── Gestos: arrastrar, pellizcar, rueda y toque ──
    function engancharGestos() {
        var ptrs = {}, drag = null, pinch = null;

        function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
        function dosPuntos() { var ids = Object.keys(ptrs); return [ptrs[ids[0]], ptrs[ids[1]]]; }

        cv.addEventListener('pointerdown', function (e) {
            try { cv.setPointerCapture(e.pointerId); } catch (x) {}
            ptrs[e.pointerId] = pos(e);
            var n = Object.keys(ptrs).length;
            if (n === 1) {
                drag = { x: ptrs[e.pointerId].x, y: ptrs[e.pointerId].y, ox: S.ox, oy: S.oy, movido: false };
            } else if (n === 2) {
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
                if (!drag.movido && Math.hypot(dx, dy) > 6) drag.movido = true;
                if (drag.movido) { S.ox = drag.ox + dx; S.oy = drag.oy + dy; pedirDibujo(); }
            }
        });

        function soltar(e) {
            if (!ptrs[e.pointerId]) return;
            var eraToque = drag && !drag.movido && Object.keys(ptrs).length === 1 && e.type === 'pointerup';
            var punto = ptrs[e.pointerId];
            delete ptrs[e.pointerId];
            if (eraToque) seleccionarEn(punto.x, punto.y);
            if (Object.keys(ptrs).length < 2) pinch = null;
            drag = null;
        }
        cv.addEventListener('pointerup', soltar);
        cv.addEventListener('pointercancel', soltar);

        cv.addEventListener('wheel', function (e) {
            e.preventDefault();
            var p = pos(e);
            zoomEn(p.x, p.y, S.scale * Math.exp(-e.deltaY * 0.0015));
        }, { passive: false });
    }

    // ── Selección de celda ──
    function celdaEn(sx, sy) {
        var wx = (sx - S.ox) / S.scale, wy = (sy - S.oy) / S.scale;
        var c = Math.floor(wy / TH + wx / TW), r = Math.floor(wy / TH - wx / TW);
        return (c >= 0 && c < N && r >= 0 && r < N) ? { r: r, c: c } : null;
    }

    function seleccionarEn(sx, sy) {
        var ce = celdaEn(sx, sy);
        S.sel = ce;
        if (ce && TW * S.scale < 40) centrarEn(ce.c, ce.r, 110 / TW);
        pintarPanel();
        pedirDibujo();
    }

    function pintarPanel() {
        var info = $('mesaCeldaInfo'), ed = $('mesaEditor');
        if (!info || !ed) return;
        if (!S.sel) {
            info.textContent = 'Toca una celda de la mesa para elegirla.';
            ed.style.display = 'none';
        } else {
            var url = S.celdas[clave(S.sel.r, S.sel.c)] || '';
            info.textContent = 'Fila ' + (S.sel.r + 1) + ' · Columna ' + (S.sel.c + 1) + (url ? ' · con imagen' : ' · vacía');
            ed.style.display = 'flex';
            $('mesaUrl').value = url;
            $('mesaQuitar').disabled = !url;
            $('mesaSinFondo').disabled = !url || S.procesando;
        }
        var total = Object.keys(S.celdas).length;
        var cont = $('mesaContador');
        if (cont) cont.textContent = total + ' / ' + (N * N);
    }

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
                : 'El link debe ser de imgbb y empezar con https://i.ibb.co/', true);
            return;
        }
        S.celdas[clave(S.sel.r, S.sel.c)] = url;
        estado('✔ Imagen colocada.');
        cambioGuardable();
    }

    function quitarSeleccionada() {
        if (!S.sel) return;
        delete S.celdas[clave(S.sel.r, S.sel.c)];
        estado('Imagen quitada.');
        cambioGuardable();
    }

    function siguiente(pos) {
        var i = pos.r * N + pos.c + 1;
        return i < N * N ? { r: Math.floor(i / N), c: i % N } : null;
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
        var total = Object.keys(S.celdas).length;
        if (!total) { estado('La mesa ya está vacía.'); return; }
        if (!window.confirm('¿Quitar las ' + total + ' imágenes de la mesa? Esto no se puede deshacer.')) return;
        S.celdas = {};
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
            if (o && o.celdas) { S.celdas = o.celdas; S.ts = o.ts || 0; }
        } catch (e) { /* sin datos guardados: se empieza vacía */ }
    }

    function guardar() {
        S.ts = Date.now();
        try { localStorage.setItem(claveLocal(), JSON.stringify({ ts: S.ts, celdas: S.celdas })); } catch (e) { console.warn('[mesa] no se pudo guardar localmente', e); }
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
        ref.set({ ts: S.ts, total: Object.keys(S.celdas).length, datos: JSON.stringify(S.celdas) })
            .then(function () { S.nubeOk = true; })
            .catch(function (e) { S.nubeOk = false; console.warn('[mesa] no se pudo sincronizar con Firestore:', e); });
    }

    function cargarNube() {
        var ref = refNube();
        if (!ref) return;
        ref.get().then(function (doc) {
            if (!doc.exists) { if (Object.keys(S.celdas).length) guardarNube(); return; }
            var d = doc.data() || {};
            if ((d.ts || 0) > S.ts && d.datos) {
                try {
                    S.celdas = JSON.parse(d.datos); S.ts = d.ts;
                    localStorage.setItem(claveLocal(), JSON.stringify({ ts: S.ts, celdas: S.celdas }));
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
        dibujarImagenes(ctx);
        dibujarSeleccion(ctx, k);
        bombear();
    }

    function dibujarMesa(ctx, k) {
        var A = proj(-M, -M), B = proj(N + M, -M), C = proj(N + M, N + M), D = proj(-M, N + M);
        var LW = TW * 2.4;
        // patas (de atrás hacia adelante)
        [[-M + 2.5, -M + 2.5], [-M + 2.5, N + M - 2.5], [N + M - 2.5, -M + 2.5], [N + M - 2.5, N + M - 2.5]].forEach(function (p) {
            var q = proj(p[0], p[1]), alto = DEPTH + LEG;
            ctx.fillStyle = '#040405'; ctx.fillRect(q[0] - LW / 2, q[1], LW / 2, alto);
            ctx.fillStyle = '#0e0e11'; ctx.fillRect(q[0], q[1], LW / 2, alto);
        });
        // tablero: costado izquierdo, costado derecho y cara superior
        poli(ctx, [D, C, [C[0], C[1] + DEPTH], [D[0], D[1] + DEPTH]], '#070708');
        poli(ctx, [C, B, [B[0], B[1] + DEPTH], [C[0], C[1] + DEPTH]], '#101013');
        poli(ctx, [A, B, C, D], '#0b0b0d');
        ctx.beginPath(); ctx.moveTo(D[0], D[1]); ctx.lineTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.lineTo(C[0], C[1]); ctx.lineTo(D[0], D[1]);
        ctx.strokeStyle = '#2d2d34'; ctx.lineWidth = 1.5 / k; ctx.stroke();
        // zona de la cuadrícula, un poco más clara
        poli(ctx, [proj(0, 0), proj(N, 0), proj(N, N), proj(0, N)], '#121216');
    }

    function dibujarRejilla(ctx, k) {
        var chica = TW * k < 8; // muy alejado: solo líneas cada 10 celdas
        for (var pasada = 0; pasada < 2; pasada++) {
            ctx.beginPath();
            for (var i = 0; i <= N; i++) {
                var mayor = i % 10 === 0;
                if ((pasada === 1) !== mayor) continue;
                if (chica && !mayor) continue;
                var a = proj(i, 0), b = proj(i, N), c = proj(0, i), d = proj(N, i);
                ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
                ctx.moveTo(c[0], c[1]); ctx.lineTo(d[0], d[1]);
            }
            ctx.strokeStyle = pasada ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.10)';
            ctx.lineWidth = (pasada ? 1.4 : 1) / k;
            ctx.stroke();
        }
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
            c0: Math.max(0, Math.floor(c0)), c1: Math.min(N - 1, Math.ceil(c1)),
            r0: Math.max(0, Math.floor(r0)), r1: Math.min(N - 1, Math.ceil(r1))
        };
    }

    // Dibuja una imagen acostada sobre la celda (r, c), ajustada con un pequeño margen
    function dibujarSprite(ctx, src, iw, ih, r, c) {
        var o = proj(c, r), s = 0.94 / Math.max(iw, ih);
        var u0 = (1 - iw * s) / 2, v0 = (1 - ih * s) / 2;
        var exx = TW / 2, exy = TH / 2, eyx = -TW / 2, eyy = TH / 2;
        ctx.save();
        ctx.transform(exx * s, exy * s, eyx * s, eyy * s, o[0] + exx * u0 + eyx * v0, o[1] + exy * u0 + eyy * v0);
        ctx.drawImage(src, 0, 0);
        ctx.restore();
    }

    function dibujarImagenes(ctx) {
        var rg = rangoVisible(), cw = TW * S.scale;
        for (var r = rg.r0; r <= rg.r1; r++) {
            for (var c = rg.c0; c <= rg.c1; c++) {
                var url = S.celdas[clave(r, c)];
                if (!url) continue;
                var th = S.thumb[url], full = S.full[url];
                var src = null;
                if (cw > UMBRAL_COMPLETA) {
                    if (full) src = full;
                    else if (!S.fallo[url]) pedir(url, true);
                }
                if (!src && th) src = th;
                if (!th && !full && cw >= UMBRAL_CARGA && !S.fallo[url]) pedir(url, false);

                if (src) {
                    dibujarSprite(ctx, src, src.naturalWidth || src.width, src.naturalHeight || src.height, r, c);
                } else {
                    var p = proj(c, r);
                    poli(ctx, [p, [p[0] + TW / 2, p[1] + TH / 2], [p[0], p[1] + TH], [p[0] - TW / 2, p[1] + TH / 2]],
                         S.fallo[url] ? '#5a2a30' : '#3b4a63');
                }
            }
        }
    }

    function dibujarSeleccion(ctx, k) {
        if (!S.sel) return;
        var p = proj(S.sel.c, S.sel.r);
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + TW / 2, p[1] + TH / 2);
        ctx.lineTo(p[0], p[1] + TH); ctx.lineTo(p[0] - TW / 2, p[1] + TH / 2); ctx.closePath();
        ctx.strokeStyle = '#e8607a'; ctx.lineWidth = Math.max(2.5 / k, 1.5); ctx.stroke();
    }
})();
