// ══════════════════════════════════════════════════════════════════════════════
// YESOS POLO KUKÚMITA — Pieza en 6 vistas (cubo desplegado) → modelo 3D
// Se carga DESPUÉS de mesa-admin.js. Se abre desde el panel de la Mesa (botón "🧊 Pieza en 6 vistas").
//
// Cómo funciona:
//  1) Subes una foto por cada lado de la pieza, acomodadas como un cubo desplegado:
//                 [ Arriba ]
//     [ Izquierda ][ Frente ][ Derecha ][ Atrás ]
//                 [ Abajo  ]
//     Como cada foto está en su lugar, el programa ya sabe de qué lado es cada una.
//  2) El fondo es negro: se detecta la silueta de la pieza en cada foto (todo lo que no es el fondo negro
//     conectado con los bordes de la foto).
//  3) "Armar 3D": se talla un bloque de vóxeles con las 6 siluetas (envolvente visual) y cada cara del modelo
//     se pinta con el color de la foto que le corresponde. Se ve en 3D y se puede girar.
//  4) "Descargar paquete": un .zip con las 6 fotos en .webp (fondo negro), una miniatura sin fondo para la
//     mesa y un pieza.json. Se descomprime dentro de la carpeta de imágenes del repo de GitHub.
//     Nada se sube a imgbb.
//
// Límite honesto: con siluetas solo se reconstruye la forma "exterior" (no los huecos hundidos), y se ve
// formada por cubitos. Las fotos deben tomarse a la misma distancia y con la pieza completa dentro del cuadro.
// ══════════════════════════════════════════════════════════════════════════════
(function (global) {
    'use strict';

    // Orden y lugar de cada vista en el cubo desplegado (col/fila de una cuadrícula de 4×3)
    var VISTAS = [
        { id: 'arriba',    nombre: 'Arriba',    col: 2, fila: 1, ayuda: 'Acuesta la pieza hacia adelante: su parte de arriba queda de frente' },
        { id: 'izquierda', nombre: 'Izquierda', col: 1, fila: 2, ayuda: 'Su lado izquierdo de frente' },
        { id: 'frente',    nombre: 'Frente',    col: 2, fila: 2, ayuda: 'La pieza de frente (foto principal)' },
        { id: 'derecha',   nombre: 'Derecha',   col: 3, fila: 2, ayuda: 'Su lado derecho de frente' },
        { id: 'atras',     nombre: 'Atrás',     col: 4, fila: 2, ayuda: 'Su parte trasera de frente' },
        { id: 'abajo',     nombre: 'Abajo',     col: 2, fila: 3, ayuda: 'Déjala caer hacia atrás: su parte de abajo queda de frente' }
    ];

    // ════════════════════════════════════════════════════════════════════
    //  NÚCLEO (sin navegador): silueta, dimensiones, tallado, malla y ZIP
    // ════════════════════════════════════════════════════════════════════

    // rgba: Uint8ClampedArray/Uint8Array de w*h*4. Devuelve { mask, bbox } o { mask, bbox:null } si no hay pieza.
    function analizarPixeles(rgba, w, h, umbral) {
        var n = w * h, i, x, y;
        var fondo = new Uint8Array(n), visto = new Uint8Array(n);
        for (i = 0; i < n; i++) {
            var p = i * 4;
            fondo[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) < umbral ? 1 : 0;
        }
        // El fondo = zona oscura conectada con los bordes. Lo oscuro de ADENTRO de la pieza (sombras) cuenta como pieza.
        var cola = new Int32Array(n), ini = 0, fin = 0;
        function sembrar(idx) { if (fondo[idx] && !visto[idx]) { visto[idx] = 1; cola[fin++] = idx; } }
        for (x = 0; x < w; x++) { sembrar(x); sembrar((h - 1) * w + x); }
        for (y = 0; y < h; y++) { sembrar(y * w); sembrar(y * w + w - 1); }
        while (ini < fin) {
            var c = cola[ini++], cx = c % w;
            if (cx > 0) sembrar(c - 1);
            if (cx < w - 1) sembrar(c + 1);
            if (c >= w) sembrar(c - w);
            if (c < n - w) sembrar(c + w);
        }
        var mask = new Uint8Array(n);
        for (i = 0; i < n; i++) mask[i] = visto[i] ? 0 : 1;

        // Quedarse solo con la mancha más grande (quita polvo y manchas sueltas)
        var etiqueta = new Int32Array(n), mejor = 0, mejorTam = 0, id = 0;
        for (i = 0; i < n; i++) {
            if (!mask[i] || etiqueta[i]) continue;
            id++; ini = 0; fin = 0; cola[fin++] = i; etiqueta[i] = id;
            while (ini < fin) {
                var q = cola[ini++], qx = q % w;
                if (qx > 0 && mask[q - 1] && !etiqueta[q - 1]) { etiqueta[q - 1] = id; cola[fin++] = q - 1; }
                if (qx < w - 1 && mask[q + 1] && !etiqueta[q + 1]) { etiqueta[q + 1] = id; cola[fin++] = q + 1; }
                if (q >= w && mask[q - w] && !etiqueta[q - w]) { etiqueta[q - w] = id; cola[fin++] = q - w; }
                if (q < n - w && mask[q + w] && !etiqueta[q + w]) { etiqueta[q + w] = id; cola[fin++] = q + w; }
            }
            if (fin > mejorTam) { mejorTam = fin; mejor = id; }
        }
        var x0 = w, y0 = h, x1 = -1, y1 = -1;
        for (i = 0; i < n; i++) {
            if (etiqueta[i] === mejor && mejor) {
                mask[i] = 1;
                x = i % w; y = (i - x) / w;
                if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
            } else mask[i] = 0;
        }
        return { mask: mask, bbox: x1 < 0 ? null : { x0: x0, y0: y0, x1: x1, y1: y1 } };
    }

    // Recorta la silueta a su caja y la lleva a tw×th (vecino más cercano). c = colores RGB.
    function remuestrear(mask, rgba, w, h, bbox, tw, th) {
        var bw = bbox.x1 - bbox.x0 + 1, bh = bbox.y1 - bbox.y0 + 1;
        var m = new Uint8Array(tw * th), c = new Uint8Array(tw * th * 3);
        for (var b = 0; b < th; b++) {
            var sy = bbox.y0 + Math.min(bh - 1, Math.floor((b + 0.5) * bh / th));
            for (var a = 0; a < tw; a++) {
                var sx = bbox.x0 + Math.min(bw - 1, Math.floor((a + 0.5) * bw / tw));
                var si = sy * w + sx, di = b * tw + a;
                m[di] = mask[si];
                c[di * 3] = rgba[si * 4]; c[di * 3 + 1] = rgba[si * 4 + 1]; c[di * 3 + 2] = rgba[si * 4 + 2];
            }
        }
        return { m: m, c: c };
    }

    // info[id] = { bw, bh } = ancho y alto de la silueta en píxeles de la foto original.
    // W = ancho (izq-der), H = alto, D = fondo (frente-atrás). El lado más largo mide N vóxeles.
    function calcularDimensiones(info, N) {
        function prom(lista) {
            var v = lista.filter(function (x) { return typeof x === 'number'; });
            return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
        }
        function g(id, k) { return info[id] ? info[id][k] : null; }
        var W = prom([g('frente', 'bw'), g('atras', 'bw'), g('arriba', 'bw'), g('abajo', 'bw')]);
        var H = prom([g('frente', 'bh'), g('atras', 'bh'), g('izquierda', 'bh'), g('derecha', 'bh')]);
        var D = prom([g('izquierda', 'bw'), g('derecha', 'bw'), g('arriba', 'bh'), g('abajo', 'bh')]);
        if (!W || !H || !D) return null;
        var s = N / Math.max(W, H, D);
        return { W: Math.max(2, Math.round(W * s)), H: Math.max(2, Math.round(H * s)), D: Math.max(2, Math.round(D * s)) };
    }

    // Tamaño (ancho×alto) al que hay que llevar cada vista, según sus dos ejes
    function tamanoVista(id, d) {
        if (id === 'frente' || id === 'atras') return [d.W, d.H];
        if (id === 'izquierda' || id === 'derecha') return [d.D, d.H];
        return [d.W, d.D]; // arriba, abajo
    }

    // v[id] = { m, c } ya remuestreado al tamaño de su vista. Índice del vóxel: (fila*D + z)*W + x  (fila 0 = arriba).
    //  Frente:    u = x            Atrás:    u = W-1-x
    //  Derecha:   u = D-1-z        Izquierda: u = z        (el frente de la pieza queda a la izquierda en la foto derecha)
    //  Arriba:    (x, z)           (abajo de la foto = frente)
    //  Abajo:     (x, D-1-z)       (arriba de la foto = frente)
    function tallar(d, v) {
        var W = d.W, H = d.H, D = d.D, s = new Uint8Array(W * H * D);
        var F = v.frente, B = v.atras, R = v.derecha, L = v.izquierda, T = v.arriba, O = v.abajo;
        for (var fila = 0; fila < H; fila++) {
            for (var z = 0; z < D; z++) {
                for (var x = 0; x < W; x++) {
                    var ok = 1;
                    if (F && !F.m[fila * W + x]) ok = 0;
                    else if (B && !B.m[fila * W + (W - 1 - x)]) ok = 0;
                    else if (R && !R.m[fila * D + (D - 1 - z)]) ok = 0;
                    else if (L && !L.m[fila * D + z]) ok = 0;
                    else if (T && !T.m[z * W + x]) ok = 0;
                    else if (O && !O.m[(D - 1 - z) * W + x]) ok = 0;
                    s[(fila * D + z) * W + x] = ok;
                }
            }
        }
        return s;
    }

    // Malla con solo las caras visibles; cada cara toma el color de la foto que le corresponde.
    function construirMalla(d, solido, v) {
        var W = d.W, H = d.H, D = d.D, k = 2 / Math.max(W, H, D);
        var pos = [], nor = [], col = [], idx = [], nv = 0;
        function lleno(x, fila, z) {
            if (x < 0 || z < 0 || fila < 0 || x >= W || z >= D || fila >= H) return false;
            return solido[(fila * D + z) * W + x] === 1;
        }
        function color(id, u, vv, tw) {
            var im = v[id];
            if (!im) return [0.72, 0.72, 0.72];
            var p = (vv * tw + u) * 3;
            return [im.c[p] / 255, im.c[p + 1] / 255, im.c[p + 2] / 255];
        }
        function cara(vs, n, c) {
            for (var i = 0; i < 4; i++) {
                pos.push((vs[i][0] - W / 2) * k, (vs[i][1] - H / 2) * k, (vs[i][2] - D / 2) * k);
                nor.push(n[0], n[1], n[2]); col.push(c[0], c[1], c[2]);
            }
            idx.push(nv, nv + 1, nv + 2, nv, nv + 2, nv + 3); nv += 4;
        }
        for (var fila = 0; fila < H; fila++) {
            var y0 = H - fila - 1, y1 = H - fila;
            for (var z = 0; z < D; z++) {
                for (var x = 0; x < W; x++) {
                    if (!lleno(x, fila, z)) continue;
                    if (!lleno(x, fila, z + 1)) cara([[x, y0, z + 1], [x + 1, y0, z + 1], [x + 1, y1, z + 1], [x, y1, z + 1]], [0, 0, 1], color('frente', x, fila, W));
                    if (!lleno(x, fila, z - 1)) cara([[x + 1, y0, z], [x, y0, z], [x, y1, z], [x + 1, y1, z]], [0, 0, -1], color('atras', W - 1 - x, fila, W));
                    if (!lleno(x + 1, fila, z)) cara([[x + 1, y0, z + 1], [x + 1, y0, z], [x + 1, y1, z], [x + 1, y1, z + 1]], [1, 0, 0], color('derecha', D - 1 - z, fila, D));
                    if (!lleno(x - 1, fila, z)) cara([[x, y0, z], [x, y0, z + 1], [x, y1, z + 1], [x, y1, z]], [-1, 0, 0], color('izquierda', z, fila, D));
                    if (!lleno(x, fila - 1, z)) cara([[x, y1, z + 1], [x + 1, y1, z + 1], [x + 1, y1, z], [x, y1, z]], [0, 1, 0], color('arriba', x, z, W));
                    if (!lleno(x, fila + 1, z)) cara([[x, y0, z], [x + 1, y0, z], [x + 1, y0, z + 1], [x, y0, z + 1]], [0, -1, 0], color('abajo', x, D - 1 - z, W));
                }
            }
        }
        return {
            pos: new Float32Array(pos), nor: new Float32Array(nor), col: new Float32Array(col),
            idx: nv > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), caras: nv / 4
        };
    }

    // ── ZIP (sin compresión: los .webp ya vienen comprimidos) ──
    var _tablaCrc = null;
    function crc32(bytes) {
        if (!_tablaCrc) {
            _tablaCrc = new Uint32Array(256);
            for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); _tablaCrc[n] = c >>> 0; }
        }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++) crc = _tablaCrc[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function utf8(texto) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(texto);
        return Uint8Array.from(Buffer.from(texto, 'utf8'));
    }
    // archivos: [{ nombre: 'carpeta/archivo.webp', datos: Uint8Array }]
    function crearZip(archivos) {
        var partes = [], central = [], offset = 0;
        var f = new Date();
        var hora = (f.getHours() << 11) | (f.getMinutes() << 5) | (f.getSeconds() >> 1);
        var fecha = (((f.getFullYear() - 1980) << 9) | ((f.getMonth() + 1) << 5) | f.getDate()) & 0xFFFF;
        archivos.forEach(function (a) {
            var nombre = utf8(a.nombre), datos = a.datos, crc = crc32(datos);
            var lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
            lh.setUint16(10, hora, true); lh.setUint16(12, fecha, true); lh.setUint32(14, crc, true);
            lh.setUint32(18, datos.length, true); lh.setUint32(22, datos.length, true);
            lh.setUint16(26, nombre.length, true); lh.setUint16(28, 0, true);
            partes.push(new Uint8Array(lh.buffer), nombre, datos);
            var ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
            ch.setUint16(10, 0, true); ch.setUint16(12, hora, true); ch.setUint16(14, fecha, true); ch.setUint32(16, crc, true);
            ch.setUint32(20, datos.length, true); ch.setUint32(24, datos.length, true);
            ch.setUint16(28, nombre.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true);
            ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true); ch.setUint32(42, offset, true);
            central.push(new Uint8Array(ch.buffer), nombre);
            offset += 30 + nombre.length + datos.length;
        });
        var tamCentral = 0;
        central.forEach(function (p) { tamCentral += p.length; });
        var fin = new DataView(new ArrayBuffer(22));
        fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, archivos.length, true); fin.setUint16(10, archivos.length, true);
        fin.setUint32(12, tamCentral, true); fin.setUint32(16, offset, true);
        var todo = partes.concat(central, [new Uint8Array(fin.buffer)]);
        var total = 0; todo.forEach(function (p) { total += p.length; });
        var salida = new Uint8Array(total), pos = 0;
        todo.forEach(function (p) { salida.set(p, pos); pos += p.length; });
        return salida;
    }

    function slug(texto) {
        return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    }

    var NUCLEO = {
        VISTAS: VISTAS, analizarPixeles: analizarPixeles, remuestrear: remuestrear, calcularDimensiones: calcularDimensiones,
        tamanoVista: tamanoVista, tallar: tallar, construirMalla: construirMalla, crearZip: crearZip, crc32: crc32, slug: slug
    };
    global.Cubo3DNucleo = NUCLEO;
    if (typeof module !== 'undefined' && module.exports) module.exports = NUCLEO;
    if (typeof document === 'undefined') return;

    // ════════════════════════════════════════════════════════════════════
    //  PANTALLA (navegador)
    // ════════════════════════════════════════════════════════════════════
    var THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    var LADO_ANALISIS = 384;   // las fotos se reducen a este lado para detectar la silueta (rápido)
    var LADO_EXPORTAR = 1024;  // tamaño máximo de cada .webp del paquete
    var LADO_MINIATURA = 512;

    var E = { fotos: {}, root: null, three: null, modelo: null, raf: 0, abierta: false, armando: false };
    function $(id) { return document.getElementById(id); }
    function estado(txt, error) {
        var el = $('cuboEstado'); if (!el) return;
        el.textContent = txt || ''; el.classList.toggle('error', !!error);
    }

    function esAdmin() {
        var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
        return typeof esCorreoAdmin === 'function' && esCorreoAdmin(user);
    }

    function construir() {
        if (E.root) return;
        var r = document.createElement('div');
        r.id = 'pantallaCubo'; r.setAttribute('role', 'dialog'); r.setAttribute('aria-modal', 'true');
        var slots = VISTAS.map(function (v) {
            return '<div class="cubo-slot' + (v.id === 'frente' ? ' principal' : '') + '" data-id="' + v.id + '" style="grid-column:' + v.col + ';grid-row:' + v.fila + '" title="' + v.ayuda + '">' +
                '<img alt="" style="display:none">' +
                '<span class="cubo-slot-nombre">' + v.nombre + '</span>' +
                '<span class="cubo-slot-mas">+</span>' +
                '<button type="button" class="cubo-slot-x" aria-label="Quitar" style="display:none">✕</button>' +
                '<input type="file" accept="image/*" style="display:none">' +
            '</div>';
        }).join('');
        r.innerHTML =
            '<div class="cubo-header"><button type="button" class="cubo-volver" id="cuboVolver" aria-label="Volver">‹</button><h3>Pieza en 6 vistas</h3></div>' +
            '<div class="cubo-cuerpo">' +
                '<div class="cubo-col">' +
                    '<p class="cubo-ayuda">Toca cada cuadro para subir su foto (o arrástrala). Gira la pieza: <b>Derecha</b> = su lado derecho de frente, ' +
                    '<b>Atrás</b> = su parte trasera, <b>Izquierda</b> = su lado izquierdo. <b>Abajo</b> = déjala caer hacia atrás; <b>Arriba</b> = acuéstala hacia adelante. ' +
                    'Mínimo: Frente y un lado (Derecha o Izquierda); con las 6 queda mejor.</p>' +
                    '<div class="cubo-red" id="cuboRed">' + slots + '</div>' +
                    '<label class="cubo-label" for="cuboNombre">Nombre de la pieza</label>' +
                    '<input id="cuboNombre" class="cubo-input" type="text" autocomplete="off" placeholder="Ej: conejo-sentado">' +
                    '<label class="cubo-label" for="cuboUmbral">Detector de fondo negro: <b id="cuboUmbralTxt">40</b> <small>(sube si queda fondo; baja si le falta pieza)</small></label>' +
                    '<input id="cuboUmbral" type="range" min="8" max="140" value="40">' +
                    '<label class="cubo-label" for="cuboRes">Detalle del 3D</label>' +
                    '<select id="cuboRes" class="cubo-input"><option value="48">Rápido (48)</option><option value="64" selected>Normal (64)</option><option value="96">Fino (96)</option></select>' +
                    '<div class="cubo-botones">' +
                        '<button type="button" class="cubo-btn principal" id="cuboArmar">🔍 Armar 3D</button>' +
                        '<button type="button" class="cubo-btn" id="cuboZip">📦 Descargar paquete (.zip)</button>' +
                    '</div>' +
                    '<div class="cubo-estado" id="cuboEstado"></div>' +
                '</div>' +
                '<div class="cubo-col cubo-visor">' +
                    '<canvas id="cuboVista"></canvas>' +
                    '<p class="cubo-nota" id="cuboNota">Aquí aparece el 3D. Arrastra para girar · rueda o pellizco para acercar.</p>' +
                '</div>' +
            '</div>';
        document.body.appendChild(r);
        E.root = r;

        $('cuboVolver').addEventListener('click', cerrar);
        $('cuboUmbral').addEventListener('input', function () { $('cuboUmbralTxt').textContent = this.value; });
        $('cuboArmar').addEventListener('click', armar3D);
        $('cuboZip').addEventListener('click', descargarPaquete);
        r.querySelectorAll('.cubo-slot').forEach(function (slot) {
            var id = slot.getAttribute('data-id'), input = slot.querySelector('input');
            slot.addEventListener('click', function (e) { if (e.target.closest('.cubo-slot-x')) return; input.click(); });
            input.addEventListener('change', function () { if (input.files && input.files[0]) ponerFoto(id, input.files[0]); input.value = ''; });
            slot.querySelector('.cubo-slot-x').addEventListener('click', function (e) { e.stopPropagation(); quitarFoto(id); });
            slot.addEventListener('dragover', function (e) { e.preventDefault(); slot.classList.add('arrastrando'); });
            slot.addEventListener('dragleave', function () { slot.classList.remove('arrastrando'); });
            slot.addEventListener('drop', function (e) {
                e.preventDefault(); slot.classList.remove('arrastrando');
                var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (f) ponerFoto(id, f);
            });
        });
        document.addEventListener('keydown', function (e) { if (E.abierta && e.key === 'Escape') cerrar(); });
        window.addEventListener('resize', function () { if (E.abierta) ajustarVisor(); });
    }

    function abrir() {
        if (!esAdmin()) return;
        construir();
        E.root.classList.add('abierta'); E.abierta = true;
        document.body.style.overflow = 'hidden';
        ajustarVisor();
        if (E.modelo) iniciarBucle();
    }
    function cerrar() {
        if (!E.root || !E.abierta) return;
        E.root.classList.remove('abierta'); E.abierta = false;
        cancelAnimationFrame(E.raf); E.raf = 0;
        var mesa = document.getElementById('pantallaMesa');
        if (!(mesa && mesa.classList.contains('abierta'))) document.body.style.overflow = '';
    }
    global.abrirCubo3D = abrir;
    global.cerrarCubo3D = cerrar;

    // ── Fotos ──
    function cargarImagen(file) {
        return new Promise(function (ok, err) {
            var url = URL.createObjectURL(file), im = new Image();
            im.onload = function () { ok(im); };
            im.onerror = function () { URL.revokeObjectURL(url); err(new Error('No se pudo leer la foto.')); };
            im.src = url;
        });
    }
    function ponerFoto(id, file) {
        if (!/^image\//.test(file.type)) { estado('Ese archivo no es una imagen.', true); return; }
        cargarImagen(file).then(function (im) {
            E.fotos[id] = { img: im, nombre: file.name };
            var slot = E.root.querySelector('.cubo-slot[data-id="' + id + '"]');
            var el = slot.querySelector('img'); el.src = im.src; el.style.display = '';
            slot.classList.add('lleno');
            slot.querySelector('.cubo-slot-x').style.display = '';
            slot.querySelector('.cubo-slot-mas').style.display = 'none';
            if (id === 'frente' && !$('cuboNombre').value.trim()) $('cuboNombre').value = slug(file.name.replace(/\.[a-z0-9]+$/i, ''));
            estado('✔ ' + VISTAS.filter(function (v) { return v.id === id; })[0].nombre + ' cargada. (' + Object.keys(E.fotos).length + ' de 6)');
        }).catch(function (e) { estado(e.message, true); });
    }
    function quitarFoto(id) {
        delete E.fotos[id];
        var slot = E.root.querySelector('.cubo-slot[data-id="' + id + '"]');
        slot.querySelector('img').style.display = 'none'; slot.querySelector('img').removeAttribute('src');
        slot.classList.remove('lleno');
        slot.querySelector('.cubo-slot-x').style.display = 'none';
        slot.querySelector('.cubo-slot-mas').style.display = '';
    }

    // Reduce la foto a "lado" y detecta la silueta. Devuelve todo lo necesario para remuestrear después.
    function analizarImagen(im, umbral, lado) {
        var iw = im.naturalWidth, ih = im.naturalHeight, esc = Math.min(1, lado / Math.max(iw, ih));
        var w = Math.max(1, Math.round(iw * esc)), h = Math.max(1, Math.round(ih * esc));
        var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);   // si la foto trae transparencia, cuenta como fondo negro
        ctx.drawImage(im, 0, 0, w, h);
        var rgba = ctx.getImageData(0, 0, w, h).data;
        var a = analizarPixeles(rgba, w, h, umbral);
        return { mask: a.mask, bbox: a.bbox, rgba: rgba, w: w, h: h, esc: esc };
    }

    // ── Armar el 3D ──
    function validar() {
        if (!E.fotos.frente) return 'Falta la foto de Frente.';
        if (!E.fotos.derecha && !E.fotos.izquierda) return 'Falta al menos un lado (Derecha o Izquierda) para saber qué tan profunda es la pieza.';
        return '';
    }
    function calcularModelo() {
        var umbral = parseInt($('cuboUmbral').value, 10) || 40, N = parseInt($('cuboRes').value, 10) || 64;
        var an = {}, info = {};
        for (var i = 0; i < VISTAS.length; i++) {
            var id = VISTAS[i].id;
            if (!E.fotos[id]) continue;
            var a = analizarImagen(E.fotos[id].img, umbral, LADO_ANALISIS);
            if (!a.bbox) throw new Error('No encontré la pieza en la foto «' + VISTAS[i].nombre + '». Baja el detector de fondo negro.');
            an[id] = a;
            info[id] = { bw: (a.bbox.x1 - a.bbox.x0 + 1) / a.esc, bh: (a.bbox.y1 - a.bbox.y0 + 1) / a.esc };
        }
        var d = calcularDimensiones(info, N);
        if (!d) throw new Error('No se pudieron calcular las medidas con estas fotos.');
        var v = {};
        Object.keys(an).forEach(function (id) {
            var t = tamanoVista(id, d);
            v[id] = remuestrear(an[id].mask, an[id].rgba, an[id].w, an[id].h, an[id].bbox, t[0], t[1]);
        });
        var solido = tallar(d, v), n = 0;
        for (var j = 0; j < solido.length; j++) n += solido[j];
        if (!n) throw new Error('Las siluetas no coinciden entre sí (el 3D quedó vacío). Revisa que cada foto esté en su lugar o ajusta el detector.');
        return { dims: d, malla: construirMalla(d, solido, v), umbral: umbral, N: N };
    }

    function armar3D() {
        if (E.armando) return;
        var err = validar(); if (err) { estado(err, true); return; }
        E.armando = true; $('cuboArmar').disabled = true;
        estado('⏳ Armando el 3D…');
        // pequeña pausa para que el navegador alcance a pintar el mensaje
        setTimeout(function () {
            var res;
            try { res = calcularModelo(); } catch (e) { estado('❌ ' + e.message, true); finalizarArmado(); return; }
            cargarThree().then(function (THREE) {
                mostrarModelo(THREE, res);
                var m = res.dims;
                estado('✔ Listo: ' + m.W + '×' + m.H + '×' + m.D + ' vóxeles, ' + res.malla.caras + ' caras. Si algo se ve mal, ajusta el detector y vuelve a armarlo.');
            }).catch(function (e) { estado('❌ ' + e.message, true); }).then(finalizarArmado);
        }, 30);
    }
    function finalizarArmado() { E.armando = false; var b = $('cuboArmar'); if (b) b.disabled = false; }

    // ── Visor three.js ──
    function cargarThree() {
        if (global.THREE) return Promise.resolve(global.THREE);
        if (E.threeP) return E.threeP;
        E.threeP = new Promise(function (ok, err) {
            var s = document.createElement('script');
            s.src = THREE_URL;
            s.onload = function () { global.THREE ? ok(global.THREE) : err(new Error('No se pudo cargar el visor 3D.')); };
            s.onerror = function () { E.threeP = null; err(new Error('No se pudo cargar el visor 3D (revisa tu internet).')); };
            document.head.appendChild(s);
        });
        return E.threeP;
    }
    function ajustarVisor() {
        var cv = $('cuboVista'); if (!cv) return;
        var w = Math.max(200, cv.clientWidth), h = Math.max(200, cv.clientHeight);
        if (E.three) { E.three.renderer.setSize(w, h, false); E.three.camera.aspect = w / h; E.three.camera.updateProjectionMatrix(); }
    }
    function mostrarModelo(THREE, res) {
        var cv = $('cuboVista');
        if (!E.three) {
            var renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            var scene = new THREE.Scene();
            var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 50); camera.position.set(0, 0.25, 4.4);
            scene.add(new THREE.AmbientLight(0xffffff, 0.8));
            var luz = new THREE.DirectionalLight(0xffffff, 0.55); luz.position.set(2, 3, 4); scene.add(luz);
            var grupo = new THREE.Group(); scene.add(grupo);
            E.three = { renderer: renderer, scene: scene, camera: camera, grupo: grupo, rx: -0.15, ry: 0.6, zoom: 1, auto: true, malla: null };
            enlazarGestos(cv);
        }
        var T = E.three;
        if (T.malla) { T.grupo.remove(T.malla); T.malla.geometry.dispose(); T.malla.material.dispose(); }
        var g = new THREE.BufferGeometry(), m = res.malla;
        g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
        g.setAttribute('color', new THREE.BufferAttribute(m.col, 3));
        g.setIndex(new THREE.BufferAttribute(m.idx, 1));
        T.malla = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
        T.grupo.add(T.malla);
        T.auto = true;
        E.modelo = res;
        ajustarVisor();
        iniciarBucle();
    }
    function enlazarGestos(cv) {
        var T = E.three, ptr = {}, ultimaDist = 0;
        function n() { return Object.keys(ptr).length; }
        cv.style.touchAction = 'none';
        cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); ptr[e.pointerId] = { x: e.clientX, y: e.clientY }; T.auto = false; ultimaDist = 0; });
        cv.addEventListener('pointermove', function (e) {
            var p = ptr[e.pointerId]; if (!p) return;
            if (n() === 1) {
                T.ry += (e.clientX - p.x) * 0.01; T.rx += (e.clientY - p.y) * 0.01;
                T.rx = Math.max(-1.5, Math.min(1.5, T.rx));
            } else if (n() === 2) {
                var ids = Object.keys(ptr), a = ptr[ids[0]], b = ptr[ids[1]];
                if (e.pointerId == ids[0]) a = { x: e.clientX, y: e.clientY }; else b = { x: e.clientX, y: e.clientY };
                var dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (ultimaDist) T.zoom = Math.max(0.4, Math.min(4, T.zoom * dist / ultimaDist));
                ultimaDist = dist;
            }
            p.x = e.clientX; p.y = e.clientY;
        });
        function soltar(e) { delete ptr[e.pointerId]; ultimaDist = 0; }
        cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
        cv.addEventListener('wheel', function (e) { e.preventDefault(); T.zoom = Math.max(0.4, Math.min(4, T.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); }, { passive: false });
    }
    function iniciarBucle() {
        if (E.raf || !E.three) return;
        (function loop() {
            if (!E.abierta) { E.raf = 0; return; }
            var T = E.three;
            if (T.auto) T.ry += 0.008;
            T.grupo.rotation.y = T.ry; T.grupo.rotation.x = T.rx;
            T.camera.position.z = 4.4 / T.zoom;
            T.renderer.render(T.scene, T.camera);
            E.raf = requestAnimationFrame(loop);
        })();
    }

    // ── Paquete .zip ──
    function aBlob(canvas, tipo, calidad) {
        return new Promise(function (ok, err) { canvas.toBlob(function (b) { b ? ok(b) : err(new Error('No se pudo preparar una imagen.')); }, tipo, calidad); });
    }
    function bytes(blob) { return blob.arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
    function ext(blob) { return blob.type === 'image/webp' ? 'webp' : 'png'; }  // algunos navegadores viejos no saben guardar webp

    function descargarPaquete() {
        var err = validar(); if (err) { estado(err, true); return; }
        var nombre = slug($('cuboNombre').value);
        if (!nombre) { estado('Escribe un nombre para la pieza.', true); return; }
        var umbral = parseInt($('cuboUmbral').value, 10) || 40, N = parseInt($('cuboRes').value, 10) || 64;
        $('cuboZip').disabled = true; estado('⏳ Preparando el paquete…');
        var archivos = [], vistasJson = {}, dims = null;
        try { dims = calcularModelo().dims; } catch (e) { estado('❌ ' + e.message, true); $('cuboZip').disabled = false; return; }

        var ids = VISTAS.map(function (v) { return v.id; }).filter(function (id) { return E.fotos[id]; });
        var cadena = Promise.resolve();
        ids.forEach(function (id) {
            cadena = cadena.then(function () {
                var im = E.fotos[id].img, esc = Math.min(1, LADO_EXPORTAR / Math.max(im.naturalWidth, im.naturalHeight));
                var cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * esc); cv.height = Math.round(im.naturalHeight * esc);
                var ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
                ctx.drawImage(im, 0, 0, cv.width, cv.height);
                return aBlob(cv, 'image/webp', 0.9).then(function (b) {
                    var archivo = id + '.' + ext(b);
                    vistasJson[id] = archivo;
                    return bytes(b).then(function (d) { archivos.push({ nombre: nombre + '/' + archivo, datos: d }); });
                });
            });
        });
        // Miniatura sin fondo (de la foto de frente) para ponerla de pie sobre la mesa
        cadena = cadena.then(function () {
            var a = analizarImagen(E.fotos.frente.img, umbral, LADO_MINIATURA);
            if (!a.bbox) throw new Error('No encontré la pieza en la foto de Frente.');
            var pad = Math.round(Math.max(a.bbox.x1 - a.bbox.x0, a.bbox.y1 - a.bbox.y0) * 0.03);
            var x0 = Math.max(0, a.bbox.x0 - pad), y0 = Math.max(0, a.bbox.y0 - pad);
            var x1 = Math.min(a.w - 1, a.bbox.x1 + pad), y1 = Math.min(a.h - 1, a.bbox.y1 + pad);
            var cw = x1 - x0 + 1, ch = y1 - y0 + 1;
            var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
            var ctx = cv.getContext('2d'), out = ctx.createImageData(cw, ch);
            for (var y = 0; y < ch; y++) for (var x = 0; x < cw; x++) {
                var si = (y0 + y) * a.w + (x0 + x), di = (y * cw + x) * 4;
                out.data[di] = a.rgba[si * 4]; out.data[di + 1] = a.rgba[si * 4 + 1]; out.data[di + 2] = a.rgba[si * 4 + 2];
                out.data[di + 3] = a.mask[si] ? 255 : 0;
            }
            ctx.putImageData(out, 0, 0);
            return aBlob(cv, 'image/webp', 0.9).then(function (b) {
                vistasJson.miniatura = 'miniatura.' + ext(b);
                return bytes(b).then(function (d) { archivos.push({ nombre: nombre + '/' + vistasJson.miniatura, datos: d }); });
            });
        });
        cadena.then(function () {
            var json = {
                nombre: nombre, version: 1, creado: new Date().toISOString(),
                archivos: vistasJson, medidasRelativas: dims, detalle: N, umbralFondoNegro: umbral
            };
            archivos.push({ nombre: nombre + '/pieza.json', datos: utf8(JSON.stringify(json, null, 2)) });
            var zip = crearZip(archivos);
            var url = URL.createObjectURL(new Blob([zip], { type: 'application/zip' }));
            var a = document.createElement('a'); a.href = url; a.download = nombre + '.zip';
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
            estado('✔ Paquete «' + nombre + '.zip» listo. Descomprímelo dentro de la carpeta de imágenes de tu repo: quedará «' + nombre + '/» con sus fotos.');
        }).catch(function (e) { estado('❌ ' + e.message, true); }).then(function () { $('cuboZip').disabled = false; });
    }
})(typeof window !== 'undefined' ? window : globalThis);
