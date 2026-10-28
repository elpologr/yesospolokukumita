/* ══════════════════════════════════════════════════════════════
 * YESOS POLO KUKÚMITA — editor-imagen.js
 * Foto del producto → quita el fondo → la pone sobre el fondo azul de Polo
 * con título editable → imagen final de 1024×1024 lista para imgbb.
 * Se conecta con el formulario "Agregar producto" (admin-producto.js).
 * Requiere imagenes/fondo-azul.webp en el sitio (si falta, usa un azul liso).
 * ══════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    var TAM = 1024;
    var FONDO_SRC = 'imagenes/fondo-azul.webp';
    var COLOR_RESPALDO = '#2f6a9a'; // se usa si no carga el archivo del fondo
    // Marca que se estampa abajo a la derecha de la imagen (dos líneas)
    var MARCA_L1 = 'Yesos Polo';
    var MARCA_L2 = 'Kukúmita';
    var LIB_URL = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.6.0/+esm';

    // ── Rendimiento ──
    // El modelo se ejecuta en un Web Worker (hilo aparte) para que la página no se congele.
    // La foto se reduce antes de procesarla: el modelo trabaja a 1024 px de todos modos y la pieza
    // en la imagen final ocupa como máximo ~730 px, así que una foto de 12 MP solo hacía más lento todo.
    var MAX_LADO_FOTO = 1280;
    // 'isnet_fp16' (por defecto, mejor recorte) | 'isnet_quint8' (~40 MB, más ligero y rápido, algo menos fino en los bordes)
    var MODELO = 'isnet_fp16';
    var CIERRE_WORKER_MS = 120000; // el worker (y su memoria) se libera tras 2 min sin usarse

    var CODIGO_WORKER = [
        "self.onmessage = async function (ev) {",
        "  var d = ev.data;",
        "  try {",
        "    var mod = await import(d.lib);",
        "    var fn = mod.removeBackground || mod.default;",
        "    var res = await fn(d.blob, {",
        "      model: d.modelo,",
        "      progress: function (k, cur, tot) { self.postMessage({ progreso: true, cur: cur, tot: tot }); }",
        "    });",
        "    self.postMessage({ ok: true, blob: res });",
        "  } catch (e) {",
        "    self.postMessage({ error: String((e && e.message) || e) });",
        "  }",
        "};"
    ].join('\n');

    var F_TIT   = '700 #px Fredoka, "Baloo 2", sans-serif';
    var F_SERIF = '800 #px "Playfair Display", serif';

    var S = { fondo: null, foto: null, producto: null, tam: 100, x: 0, y: 0,
              tituloEditado: false, titulo: '', ocupado: false, timer: null,
              worker: null, workerTimer: null, id: 0, repetir: false };

    function $(id) { return document.getElementById(id); }
    function val(id) { var e = $(id); return e ? e.value.trim() : ''; }

    function cargarImg(src) {
        return new Promise(function (ok, err) {
            var i = new Image();
            i.onload = function () { ok(i); };
            i.onerror = function () { err(new Error('No se pudo cargar la imagen')); };
            i.src = src;
        });
    }

    // Si una zona suelta mide menos de este % de la pieza principal, se considera "resto" (letras, marcas) y se borra.
    // Súbelo (ej. 0.08) si siguen quedando restos grandes; bájalo (ej. 0.01) si se borran partes reales de la pieza.
    var MIN_ZONA_PIEZA = 0.04;
    var UMBRAL_ALFA = 40;

    // Quita las motas sueltas (texto, marcas de agua) que el modelo dejó fuera de la pieza principal
    // y recorta los bordes transparentes para poder centrar y escalar bien la pieza.
    function recortar(img) {
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var g = c.getContext('2d'); g.drawImage(img, 0, 0);
        var im = g.getImageData(0, 0, w, h), d = im.data, n = w * h;

        // Etiquetado de zonas conectadas (8 vecinos) sobre los píxeles visibles
        var lab = new Int32Array(n), pila = new Int32Array(n), tam = [0], cur = 0;
        for (var i = 0; i < n; i++) {
            if (lab[i] || d[i * 4 + 3] <= UMBRAL_ALFA) continue;
            cur++; var sp = 0, cnt = 0; pila[sp++] = i; lab[i] = cur;
            while (sp) {
                var k = pila[--sp]; cnt++;
                var kx = k % w, ky = (k - kx) / w;
                for (var dy = -1; dy <= 1; dy++) {
                    var yy = ky + dy; if (yy < 0 || yy >= h) continue;
                    for (var dx = -1; dx <= 1; dx++) {
                        var xx = kx + dx; if (xx < 0 || xx >= w) continue;
                        var q = yy * w + xx;
                        if (!lab[q] && d[q * 4 + 3] > UMBRAL_ALFA) { lab[q] = cur; pila[sp++] = q; }
                    }
                }
            }
            tam[cur] = cnt;
        }
        if (!cur) return img;
        var max = 0; for (var z = 1; z <= cur; z++) if (tam[z] > max) max = tam[z];
        var minPx = max * MIN_ZONA_PIEZA;

        // Borra las zonas pequeñas y mide el recuadro de lo que se queda
        var x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
            var j = y * w + x, l = lab[j];
            if (!l) continue;
            if (tam[l] < minPx) { d[j * 4 + 3] = 0; continue; }
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
        if (x1 <= x0 || y1 <= y0) return img;
        g.putImageData(im, 0, 0);
        var o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
        o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
        return o;
    }

    // Texto con contorno que se encoge solo si no cabe en maxW
    function texto(g, txt, x, y, tam, fam, relleno, borde, grosor, maxW) {
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        while (true) {
            g.font = fam.replace('#', tam);
            if (g.measureText(txt).width <= maxW || tam <= 14) break;
            tam -= 2;
        }
        if (borde) { g.lineWidth = grosor; g.strokeStyle = borde; g.strokeText(txt, x, y); }
        g.fillStyle = relleno; g.fillText(txt, x, y);
    }

    // Pinta la imagen completa (fondo + pieza + título + marca) en el contexto g, con el fondo indicado
    function pintar(g, fondo, colorRespaldo) {
        g.clearRect(0, 0, TAM, TAM);
        if (fondo) g.drawImage(fondo, 0, 0, TAM, TAM);
        else { g.fillStyle = colorRespaldo; g.fillRect(0, 0, TAM, TAM); }

        // Pieza
        var p = S.producto;
        if (p) {
            var w = p.naturalWidth || p.width, h = p.naturalHeight || p.height;
            var esc = Math.min(620 / w, 730 / h) * (S.tam / 100), dw = w * esc, dh = h * esc;
            g.save();
            g.shadowColor = 'rgba(60,20,40,.35)'; g.shadowBlur = 28; g.shadowOffsetY = 12;
            g.drawImage(p, TAM / 2 + S.x - dw / 2, 590 + S.y - dh / 2, dw, dh);
            g.restore();
        }

        // Título
        var titulo = S.titulo;
        if (titulo) texto(g, titulo, TAM / 2, 86, 72, F_TIT, '#fff', '#111', 12, 940);

        // Marca
        texto(g, MARCA_L1, 862, 930, 54, F_SERIF, '#111', '#fff', 8, 290);
        texto(g, MARCA_L2, 862, 988, 66, F_SERIF, '#111', '#fff', 8, 290);
    }

    // Lo que se ve en pantalla (fondo azul de Yesos Polo)
    function dibujar() {
        var c = $('canvasImagenProducto'); if (!c) return;
        pintar(c.getContext('2d'), S.fondo, COLOR_RESPALDO);
    }

    function exportar() {
        var c = $('canvasImagenProducto'); if (!c || !S.foto) return;
        var u = c.toDataURL('image/webp', 0.9);
        if (u.indexOf('data:image/webp') !== 0) u = c.toDataURL('image/jpeg', 0.9); // Safari viejo
        window._imagenProductoSeleccionada = u;
    }

    async function fuentes() {
        try {
            await Promise.all([
                document.fonts.load('700 60px Fredoka'),
                document.fonts.load('800 40px "Playfair Display"')
            ]);
        } catch (e) {}
    }

    function redibujar() {
        clearTimeout(S.timer);
        S.timer = setTimeout(async function () {
            await fuentes(); dibujar(); exportar();
            // Avisa al formulario: si ya había enlaces de imgbb publicados, dejan de corresponder a esta imagen
            document.dispatchEvent(new CustomEvent('editorImagenCambio'));
        }, 60);
    }

    function estado(t, error) {
        var e = $('estadoEditorImagen');
        if (e) { e.textContent = t || ''; e.className = 'sap-estado' + (error ? ' error' : ''); }
    }

    // El título de la imagen solo cambia cuando se presiona Enter o el botón "Aplicar"
    function aplicarTitulo() {
        S.titulo = val('inputTituloImagen');
        redibujar();
    }

    function sincronizarTitulo() {
        var t = $('inputTituloImagen'); if (!t || S.tituloEditado) return;
        var n = val('inputNombreProducto');
        t.value = n ? '¡ ' + n + ' !' : '';
    }

    // Reduce la foto (si es más grande que MAX_LADO_FOTO) y la devuelve como Blob JPEG
    async function fotoLigera(dataUrl) {
        var img = await cargarImg(dataUrl);
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, MAX_LADO_FOTO / Math.max(w, h));
        if (k >= 1) return (await fetch(dataUrl)).blob();
        var c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        return new Promise(function (ok, err) {
            c.toBlob(function (b) { b ? ok(b) : err(new Error('No se pudo reducir la foto')); }, 'image/jpeg', 0.92);
        });
    }

    function cerrarWorker() {
        clearTimeout(S.workerTimer);
        if (S.worker) { S.worker.terminate(); S.worker = null; }
    }

    // Quita el fondo en un Web Worker: la página sigue fluida mientras trabaja el modelo
    function quitarFondoEnWorker(blob) {
        return new Promise(function (ok, err) {
            var w;
            try {
                if (!S.worker) {
                    var url = URL.createObjectURL(new Blob([CODIGO_WORKER], { type: 'text/javascript' }));
                    S.worker = new Worker(url, { type: 'module' });
                }
                w = S.worker;
            } catch (e) { return err(e); }
            clearTimeout(S.workerTimer);
            w.onmessage = function (ev) {
                var d = ev.data || {};
                if (d.progreso) { if (d.tot) estado('⏳ Procesando… ' + Math.round(d.cur / d.tot * 100) + '%'); return; }
                S.workerTimer = setTimeout(cerrarWorker, CIERRE_WORKER_MS);
                if (d.ok) ok(d.blob); else { cerrarWorker(); err(new Error(d.error || 'Error en el worker')); }
            };
            w.onerror = function (e) { cerrarWorker(); err(new Error((e && e.message) || 'Error en el worker')); };
            w.postMessage({ lib: LIB_URL, blob: blob, modelo: MODELO });
        });
    }

    // Plan B (navegadores sin soporte de module workers): en la página, pero con la foto ya reducida
    async function quitarFondoEnPagina(blob) {
        var mod = await import(LIB_URL);
        var fn = mod.removeBackground || mod.default;
        return fn(blob, { model: MODELO, progress: function (k, cur, tot) {
            if (tot) estado('⏳ Procesando… ' + Math.round(cur / tot * 100) + '%');
        } });
    }

    async function quitarFondo() {
        if (!S.foto || S.ocupado) return;
        S.ocupado = true; S.repetir = false;
        var miId = S.id; // si mientras trabaja se elige otra foto, este resultado ya no sirve
        var btn = $('btnQuitarFondo'); if (btn) btn.disabled = true;
        estado('⏳ Quitando el fondo… la primera vez descarga el modelo y puede tardar un poco.');
        try {
            var blob = await fotoLigera(S.foto);
            var res;
            try {
                res = await quitarFondoEnWorker(blob);
            } catch (e1) {
                console.warn('[editor-imagen] el worker falló, se usa la página principal:', e1);
                res = await quitarFondoEnPagina(blob);
            }
            var img = await cargarImg(URL.createObjectURL(res));
            if (miId !== S.id) return; // se eligió otra foto: se descarta; el finally lanza el proceso de la nueva
            S.producto = recortar(img);
            estado('✅ Fondo quitado. Ajusta tamaño y posición si hace falta.');
        } catch (e) {
            console.error('[editor-imagen]', e);
            if (miId === S.id) estado('⚠️ No se pudo quitar el fondo. Se usa la foto tal cual; puedes reintentar.', true);
        } finally {
            S.ocupado = false;
            if (btn) btn.disabled = false;
            redibujar();
            if (S.repetir) { S.repetir = false; quitarFondo(); } // había una foto nueva esperando
        }
    }

    async function cargarFoto(dataUrl) {
        S.foto = dataUrl; S.tam = 100; S.x = 0; S.y = 0;
        S.id++; if (S.ocupado) S.repetir = true; // si aún procesaba la foto anterior, la nueva espera su turno
        ['rangoTamImagen', 'rangoXImagen', 'rangoYImagen'].forEach(function (id, i) {
            var r = $(id); if (r) r.value = i === 0 ? 100 : 0;
        });
        var ed = $('editorImagenProducto'); if (ed) ed.style.display = 'block';
        var pv = $('previewImagenProducto'); if (pv) pv.style.display = 'none';
        sincronizarTitulo();
        S.titulo = val('inputTituloImagen');
        try { S.fondo = S.fondo || await cargarImg(FONDO_SRC); } catch (e) { S.fondo = null; }
        S.producto = await cargarImg(dataUrl);
        redibujar();
        quitarFondo(); // automático
    }

    function reset() {
        S.id++; S.repetir = false; S.foto = null; S.producto = null; S.tituloEditado = false; S.titulo = ''; S.tam = 100; S.x = 0; S.y = 0;
        var ed = $('editorImagenProducto'); if (ed) ed.style.display = 'none';
        var t = $('inputTituloImagen'); if (t) t.value = '';
        estado('');
        window._imagenProductoSeleccionada = null;
        document.dispatchEvent(new CustomEvent('editorImagenCambio'));
    }

    // ── Conexión con el formulario ──
    var nom = $('inputNombreProducto');
    if (nom) {
        nom.addEventListener('input', sincronizarTitulo); // solo rellena el campo de título, no la imagen
        nom.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicarTitulo(); } });
    }
    var tit = $('inputTituloImagen');
    if (tit) {
        tit.addEventListener('input', function () { S.tituloEditado = tit.value.trim() !== ''; });
        tit.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); aplicarTitulo(); } });
    }
    var ba = $('btnAplicarTitulo'); if (ba) ba.addEventListener('click', aplicarTitulo);
    [['rangoTamImagen', 'tam'], ['rangoXImagen', 'x'], ['rangoYImagen', 'y']].forEach(function (par) {
        var r = $(par[0]);
        if (r) r.addEventListener('input', function () { S[par[1]] = Number(r.value); redibujar(); });
    });
    var bq = $('btnQuitarFondo'); if (bq) bq.addEventListener('click', quitarFondo);

    // Descarga la imagen ya editada (PNG 1024×1024) sin necesidad de guardar el producto
    async function descargar() {
        var c = $('canvasImagenProducto'); if (!c || !S.foto) return;
        await fuentes(); dibujar(); // asegura que lo descargado sea lo que se ve
        c.toBlob(function (b) {
            if (!b) { estado('⚠️ No se pudo generar la imagen para descargar.', true); return; }
            var nombre = val('inputNombreProducto').toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'producto';
            var url = URL.createObjectURL(b), a = document.createElement('a');
            a.href = url; a.download = nombre + '.png';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        }, 'image/png');
    }
    var bd = $('btnDescargarImagen'); if (bd) bd.addEventListener('click', descargar);

    window.editorImagenProducto = {
        cargarFoto: cargarFoto,
        reset: reset,
        ocupado: function () { return S.ocupado; },
        tituloPendiente: function () { return !!S.foto && val('inputTituloImagen') !== S.titulo; }
    };
})();
