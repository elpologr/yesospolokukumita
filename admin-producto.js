// ══════════════════════════════════════════════════════════════════════════════
// YESOS POLO KUKÚMITA — Agregar producto (solo administradores)
// Se carga DESPUÉS de app.js (usa: auth, esCorreoAdmin, mostrarToast y CONFIG).
//
// Paso 2 (formulario básico): imagen principal (archivo o link de imgbb), nombre, precios,
// medidas, descripción, video, existencia, oferta, más vendido y etiqueta principal.
// Paso 3a: fotos adicionales (galería, hasta 50 imágenes por producto, subidas una por una).
// Paso 3b: editor de imagen (editor-imagen.js): la foto principal pasa por el quitafondos y se
// arma sobre el fondo azul de Polo con título; esa imagen final es la que se sube a imgbb.
// Paso 4a: sub-etiquetas (columna H). Polo no tiene columnas de evento ni de forma como Fer: sus
// "sub etiquetas" (cirio, tazón, stich…) van todas juntas en la columna H.
// Todavía NO incluye: configurar (editar) ni mover producto (vienen en los siguientes pasos).
//
// La seguridad real está en el servidor (CodePolo.gs): vuelve a verificar el idToken de Firebase
// y el correo contra CORREOS_ADMIN. Aquí solo se muestra u oculta el botón.
// ══════════════════════════════════════════════════════════════════════════════

var _imagenProductoSeleccionada = null; // dataURL de la imagen principal final (la arma editor-imagen.js)
var _principalElegida = false;
var _subEtiquetasProducto = [];         // sub-etiquetas elegidas (columna H), en minúsculas y sin repetir
var MAX_SUBETIQUETAS = 15;          // true desde que se elige una foto, aunque el editor aún la esté armando
var _guardandoProducto = false;

// Fotos adicionales (galería): la principal es la 1ª imagen del producto; el resto se suben tal cual (reducidas)
var MAX_IMAGENES_PRODUCTO = 50;
var _imagenesExtraProducto = [];   // [{ dataUrl, miniatura }] en el orden en que se subirán
var _procesandoFotosProducto = false;

// ── Botón del perfil: solo visible para administradores ──
function actualizarBotonAgregarProducto() {
    var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    var admin = esCorreoAdmin(user);
    var btn = document.getElementById('btnAgregarProducto');
    if (btn) btn.style.display = admin ? 'flex' : 'none';
    if (!admin) cerrarSubmenuAgregarProducto();
}

(function engancharAuthAgregarProducto() {
    if (typeof auth === 'undefined' || !auth.onAuthStateChanged || typeof esCorreoAdmin !== 'function') {
        setTimeout(engancharAuthAgregarProducto, 300);
        return;
    }
    auth.onAuthStateChanged(function () { actualizarBotonAgregarProducto(); });
    actualizarBotonAgregarProducto();
})();

// ── Abrir / cerrar el formulario ──
function abrirSubmenuAgregarProducto() {
    var user = auth.currentUser;
    if (!esCorreoAdmin(user)) return; // por si acaso; el servidor vuelve a verificar
    var sub = document.getElementById('submenuAgregarProducto');
    if (!sub) return;
    sub.classList.add('abierto');
    sub.scrollTop = 0;
    _llenarSugerenciasSubEtiquetas();
    document.body.style.overflow = 'hidden';
    validarFormularioProducto();
}

function cerrarSubmenuAgregarProducto() {
    var sub = document.getElementById('submenuAgregarProducto');
    if (!sub || !sub.classList.contains('abierto')) return;
    sub.classList.remove('abierto');
    // La pantalla de perfil sigue abierta debajo: mantener el scroll de fondo bloqueado
    var perfil = document.getElementById('pantallaPerfil');
    if (!(perfil && perfil.classList.contains('activo'))) document.body.style.overflow = '';
}

// ── Utilidades del formulario ──
function _campoProducto(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function _estadoImagen(txt, error) {
    var e = document.getElementById('sapImagenEstado');
    if (!e) return;
    e.textContent = txt || '';
    e.classList.toggle('error', !!error);
}

function alternarEtiquetaPrincipal(btn) {
    var activo = btn.classList.toggle('activo');
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    validarFormularioProducto();
}

function obtenerEtiquetasPrincipales() {
    var lista = [];
    document.querySelectorAll('#chipsEtiquetaPrincipal .sap-chip.activo').forEach(function (b) {
        lista.push(b.getAttribute('data-valor'));
    });
    return lista;
}

// Botón Sí/No de En Oferta (columna K) y Más Vendido (columna L)
function alternarToggleProducto(btn) {
    var activo = btn.classList.toggle('activo');
    btn.setAttribute('aria-pressed', activo ? 'true' : 'false');
    var t = btn.querySelector('.sap-toggle-estado');
    if (t) t.textContent = activo ? 'Sí' : 'No';
}

function _toggleProductoActivo(id) {
    var b = document.getElementById(id);
    return !!(b && b.classList.contains('activo'));
}

// Botones − / + de la existencia (columna J)
function ajustarExistenciaProducto(delta) {
    var el = document.getElementById('inputExistenciaProducto');
    if (!el) return;
    var actual = parseInt(el.value, 10);
    if (isNaN(actual)) actual = 0;
    var nuevo = Math.min(100000, Math.max(0, actual + delta));
    el.value = (nuevo === 0 && delta < 0) ? '' : String(nuevo);
}

// Botones − / + de las medidas (columna I: alto/ancho)
function ajustarMedidaProducto(idInput, delta) {
    var el = document.getElementById(idInput);
    if (!el) return;
    var actual = parseFloat(el.value);
    if (isNaN(actual)) actual = 0;
    var nuevo = Math.min(1000, Math.max(0, Math.round((actual + delta) * 100) / 100));
    el.value = (nuevo === 0 && delta < 0) ? '' : String(nuevo);
}

// "Guardar" se habilita solo con nombre, precio original, imagen y al menos una etiqueta principal
function validarFormularioProducto() {
    var hayImagen = !!_imagenProductoSeleccionada || !!_extraerUrlImgbb(_campoProducto('inputUrlImagenProducto'));
    var ok = _campoProducto('inputNombreProducto') !== '' && _campoProducto('inputPrecioOriginal') !== ''
             && hayImagen && obtenerEtiquetasPrincipales().length > 0 && !_guardandoProducto && !_procesandoFotosProducto;
    var btn = document.getElementById('btnGuardarProducto');
    if (btn) btn.disabled = !ok;
}

function limpiarFormularioProducto() {
    ['inputNombreProducto', 'inputPrecioOriginal', 'inputPrecioBazar', 'inputDescripcionProducto',
     'inputUrlImagenProducto', 'inputImagenProducto', 'inputAltoProducto', 'inputAnchoProducto',
     'inputExistenciaProducto', 'inputVideoProducto'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = '';
    });
    _imagenProductoSeleccionada = null;
    _principalElegida = false;
    if (window.editorImagenProducto) window.editorImagenProducto.reset();
    _subEtiquetasProducto = [];
    _renderSubEtiquetas();
    _imagenesExtraProducto = [];
    var pf = document.getElementById('previewImagenProducto');
    if (pf) { pf.style.display = 'none'; pf.removeAttribute('src'); }
    var pu = document.getElementById('previewUrlImagenProducto');
    if (pu) { pu.style.display = 'none'; pu.removeAttribute('src'); }
    _estadoUrlImagen('');
    _estadoImagen('');
    _estadoExtrasProducto('');
    _renderExtrasProducto();
    document.querySelectorAll('#chipsEtiquetaPrincipal .sap-chip').forEach(function (b) {
        b.classList.remove('activo'); b.setAttribute('aria-pressed', 'false');
    });
    ['btnEnOfertaProducto', 'btnMasVendidoProducto'].forEach(function (id) {
        var b = document.getElementById(id);
        if (!b) return;
        b.classList.remove('activo'); b.setAttribute('aria-pressed', 'false');
        var t = b.querySelector('.sap-toggle-estado'); if (t) t.textContent = 'No';
    });
    validarFormularioProducto();
}

// ── Sub-etiquetas (columna H) ──
// Igual que el servidor: minúsculas, sin comas ni barras, espacios simples y máx. 30 letras.
function _normalizarSubEtiqueta(t) {
    return String(t || '').replace(/[|,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().substring(0, 30);
}

// Sugerencias: las sub-etiquetas que ya usan los productos cargados en el catálogo
function _llenarSugerenciasSubEtiquetas() {
    var dl = document.getElementById('listaSubEtiquetas');
    if (!dl) return;
    var vistas = {}, lista = [];
    document.querySelectorAll('[data-subtags]').forEach(function (el) {
        (el.getAttribute('data-subtags') || '').split('|').forEach(function (t) {
            t = _normalizarSubEtiqueta(t);
            if (t && !vistas[t]) { vistas[t] = true; lista.push(t); }
        });
    });
    lista.sort();
    dl.innerHTML = '';
    lista.forEach(function (t) {
        var o = document.createElement('option'); o.value = t; dl.appendChild(o);
    });
}

function _renderSubEtiquetas() {
    var cont = document.getElementById('sapSubEtiquetasLista');
    if (!cont) return;
    cont.innerHTML = '';
    _subEtiquetasProducto.forEach(function (t, i) {
        var chip = document.createElement('span');
        chip.className = 'sap-subtag';
        var txt = document.createElement('span');
        txt.textContent = t;
        var x = document.createElement('button');
        x.type = 'button';
        x.setAttribute('aria-label', 'Quitar ' + t);
        x.textContent = '✕';
        x.addEventListener('click', function () {
            if (_guardandoProducto) return;
            _subEtiquetasProducto.splice(i, 1);
            _renderSubEtiquetas();
        });
        chip.appendChild(txt); chip.appendChild(x);
        cont.appendChild(chip);
    });
}

// Agrega lo escrito en el campo. Acepta varias separadas por coma ("cirio, tazón").
function agregarSubEtiquetaProducto() {
    var input = document.getElementById('inputSubEtiqueta');
    if (!input) return;
    var partes = String(input.value || '').split(',');
    var agregadas = 0, llena = false;
    partes.forEach(function (crudo) {
        var t = _normalizarSubEtiqueta(crudo);
        if (!t || _subEtiquetasProducto.indexOf(t) !== -1) return;
        if (_subEtiquetasProducto.length >= MAX_SUBETIQUETAS) { llena = true; return; }
        _subEtiquetasProducto.push(t); agregadas++;
    });
    if (llena) mostrarToast('Máximo ' + MAX_SUBETIQUETAS + ' sub-etiquetas por producto.');
    input.value = '';
    input._ultimoTexto = '';
    _renderSubEtiquetas();
}

(function engancharCampoSubEtiqueta() {
    var input = document.getElementById('inputSubEtiqueta');
    if (!input) return;
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); agregarSubEtiquetaProducto(); }
    });
    // Al elegir una sugerencia de la lista o escribir una coma, se agrega sola
    input.addEventListener('input', function () {
        var v = input.value;
        if (v.indexOf(',') !== -1) { agregarSubEtiquetaProducto(); return; }
        if (_subEtiquetasProducto.length < MAX_SUBETIQUETAS && v.trim() &&
            Array.prototype.some.call(document.querySelectorAll('#listaSubEtiquetas option'), function (o) { return o.value === v; }) &&
            (!input._ultimoTexto || v.length - input._ultimoTexto.length > 1)) {
            agregarSubEtiquetaProducto(); // se eligió una opción completa de la lista
        }
        input._ultimoTexto = v;
    });
})();

// ── Imagen principal: foto del dispositivo ──
// Sin imagen principal se pueden elegir varias (la 1ª es la principal y las demás quedan como adicionales).
// Con imagen principal se elige UNA sola: la nueva principal (las adicionales se conservan).
function elegirImagenProducto() {
    var input = document.getElementById('inputImagenProducto');
    if (!input) return;
    input.multiple = !_hayImagenPrincipal();
    input.click();
}

// ¿Ya se eligió la imagen principal (foto o link de imgbb)?
function _hayImagenPrincipal() {
    return _principalElegida || !!_imagenProductoSeleccionada || !!_extraerUrlImgbb(_campoProducto('inputUrlImagenProducto'));
}

// Con imagen principal el botón pasa a "Elegir otra imagen principal"
function _pintarBotonImagen() {
    var t = document.getElementById('sapBtnImagenTitulo');
    var sub = document.getElementById('sapBtnImagenSub');
    if (!t) return;
    var hay = _hayImagenPrincipal();
    t.textContent = hay ? 'Elegir otra imagen principal' : 'Agregar imagen';
    if (sub) sub.textContent = hay
        ? 'Reemplaza la principal; las fotos adicionales se conservan'
        : 'Se reduce y se sube a ImgBB al guardar';
}

// Lee un archivo y lo reduce (JPG). Devuelve { full, mini }; mini solo si se pide maxMini.
function _leerImagenProducto(archivo, maxLado, calidad, maxMini) {
    return new Promise(function (resolve, reject) {
        var lector = new FileReader();
        lector.onerror = function () { reject(new Error('lectura')); };
        lector.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var reducir = function (lado, cal) {
                    var escala = Math.min(1, lado / Math.max(img.width, img.height));
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.round(img.width * escala);
                    canvas.height = Math.round(img.height * escala);
                    var ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    return canvas.toDataURL('image/jpeg', cal);
                };
                resolve({ full: reducir(maxLado, calidad), mini: maxMini ? reducir(maxMini, 0.7) : '' });
            };
            img.onerror = function () { reject(new Error('imagen')); };
            img.src = e.target.result;
        };
        lector.readAsDataURL(archivo);
    });
}

async function previsualizarImagenProducto(event) {
    var input = event.target;
    var archivos = Array.prototype.slice.call(input.files || []);
    if (!archivos.length) return;
    if (_procesandoFotosProducto) { mostrarToast('Espera a que termine de preparar las fotos.'); input.value = ''; return; }

    // Cupo: lo que ya tiene el producto + las fotos nuevas no puede pasar del máximo
    var principalNueva = !_hayImagenPrincipal(); // la 1ª foto solo suma si no había principal
    var cupo = MAX_IMAGENES_PRODUCTO - _totalImagenesProducto() + (principalNueva ? 0 : 1);
    if (archivos.length > cupo) {
        archivos = archivos.slice(0, Math.max(cupo, 0));
        mostrarToast('Máximo ' + MAX_IMAGENES_PRODUCTO + ' imágenes por producto: solo se tomaron ' + Math.max(cupo, 0) + '.');
        if (!archivos.length) { input.value = ''; return; }
    }

    _procesandoFotosProducto = true;
    validarFormularioProducto();
    _estadoImagen('Preparando la imagen…');
    try {
        // 1ª foto = imagen principal
        var r = await _leerImagenProducto(archivos[0], 1200, 0.9, 0);
        // La foto reemplaza cualquier link pegado (para no subir las dos)
        _limpiarUrlImagen();
        _principalElegida = true;
        if (window.editorImagenProducto) {
            // editor-imagen.js quita el fondo y arma la imagen final con el fondo azul; cuando termina de
            // dibujar deja el resultado en _imagenProductoSeleccionada y avisa con 'editorImagenCambio'
            _imagenProductoSeleccionada = null;
            window.editorImagenProducto.cargarFoto(r.full).catch(function () {
                _principalElegida = false;
                _estadoImagen('No se pudo preparar esa imagen. Prueba con otra.', true);
                _renderExtrasProducto();
                validarFormularioProducto();
            });
            _estadoImagen('✔ Foto cargada. Ajusta la imagen en el editor de abajo; se subirá a imgbb al guardar.');
        } else {
            // Sin editor (no cargó editor-imagen.js): se usa la foto tal cual
            _imagenProductoSeleccionada = r.full;
            var pf = document.getElementById('previewImagenProducto');
            if (pf) { pf.src = r.full; pf.style.display = 'block'; }
            _estadoImagen('✔ Imagen lista. Se subirá a imgbb al guardar.');
        }
    } catch (e) {
        _estadoImagen('No se pudo leer esa imagen. Prueba con otra.', true);
        _procesandoFotosProducto = false;
        input.value = '';
        _renderExtrasProducto();
        validarFormularioProducto();
        return;
    }
    // Las demás quedan como fotos adicionales
    try {
        if (archivos.length > 1) await _procesarExtrasProducto(archivos.slice(1));
    } finally {
        _procesandoFotosProducto = false;
    }
    input.value = ''; // permite volver a elegir el mismo archivo
    _renderExtrasProducto();
    validarFormularioProducto();
}

// ── Fotos adicionales (galería) ──
// Imágenes que tendría el producto al guardar: la principal (si hay) + las adicionales
function _totalImagenesProducto() {
    return (_hayImagenPrincipal() ? 1 : 0) + _imagenesExtraProducto.length;
}

function _estadoExtrasProducto(t) {
    var e = document.getElementById('sapExtrasEstado');
    if (e) e.textContent = t || '';
}

function _renderExtrasProducto() {
    _pintarBotonImagen();
    var lista = document.getElementById('sapExtrasLista');
    if (lista) {
        lista.innerHTML = '';
        _imagenesExtraProducto.forEach(function (it, i) {
            var caja = document.createElement('div');
            caja.className = 'sap-extra';
            var img = document.createElement('img');
            img.src = it.miniatura;
            img.alt = 'Foto ' + (i + 2);
            var num = document.createElement('span');
            num.textContent = String(i + 2);
            var quitar = document.createElement('button');
            quitar.type = 'button';
            quitar.setAttribute('aria-label', 'Quitar foto ' + (i + 2));
            quitar.textContent = '✕';
            quitar.addEventListener('click', function () {
                if (_guardandoProducto) return;
                _imagenesExtraProducto.splice(i, 1);
                _renderExtrasProducto();
            });
            caja.appendChild(img); caja.appendChild(num); caja.appendChild(quitar);
            lista.appendChild(caja);
        });
        lista.style.display = _imagenesExtraProducto.length ? 'flex' : 'none';
    }
    var total = _totalImagenesProducto();
    var cont = document.getElementById('sapExtrasContador');
    if (cont) cont.textContent = total + ' / ' + MAX_IMAGENES_PRODUCTO + ' imágenes en el producto' +
        (_imagenesExtraProducto.length ? ' (' + _imagenesExtraProducto.length + ' adicionales por subir)' : '');
    var btn = document.getElementById('btnAgregarExtras');
    if (btn) btn.disabled = total >= MAX_IMAGENES_PRODUCTO;
}

// Procesa (una por una, para no saturar la memoria del celular) las fotos adicionales
async function _procesarExtrasProducto(archivos) {
    var omitidas = 0;
    try {
        for (var i = 0; i < archivos.length; i++) {
            _estadoExtrasProducto('⏳ Preparando fotos… ' + (i + 1) + '/' + archivos.length);
            try {
                var r = await _leerImagenProducto(archivos[i], 1200, 0.85, 160);
                _imagenesExtraProducto.push({ dataUrl: r.full, miniatura: r.mini });
            } catch (e) { omitidas++; }
            _renderExtrasProducto();
        }
    } finally {
        _estadoExtrasProducto(omitidas ? '⚠️ ' + omitidas + ' foto(s) no se pudieron leer y se omitieron.' : '');
    }
}

function elegirImagenesExtraProducto() {
    var input = document.getElementById('inputImagenesExtraProducto');
    if (input) input.click();
}

// "➕ Agregar más fotos": se suman a las adicionales sin tocar la principal
async function agregarImagenesExtraProducto(event) {
    var input = event.target;
    var archivos = Array.prototype.slice.call(input.files || []);
    if (!archivos.length) return;
    if (_procesandoFotosProducto) { mostrarToast('Espera a que termine de preparar las fotos.'); input.value = ''; return; }
    var cupo = MAX_IMAGENES_PRODUCTO - _totalImagenesProducto();
    if (cupo <= 0) {
        mostrarToast('Ya tiene el máximo de ' + MAX_IMAGENES_PRODUCTO + ' imágenes.');
        input.value = '';
        return;
    }
    if (archivos.length > cupo) {
        archivos = archivos.slice(0, cupo);
        mostrarToast('Máximo ' + MAX_IMAGENES_PRODUCTO + ' imágenes por producto: solo se agregaron ' + cupo + '.');
    }
    _procesandoFotosProducto = true;
    validarFormularioProducto();
    try {
        await _procesarExtrasProducto(archivos);
    } finally {
        _procesandoFotosProducto = false;
    }
    input.value = '';
    _renderExtrasProducto();
    validarFormularioProducto();
}

// ── Imagen principal: link directo de imgbb (alternativa al archivo) ──
var _RE_IMGBB_DIRECTO = /https:\/\/i\.ibb\.co\/[^\s,"'<>\[\]()]+/i;

function _extraerUrlImgbb(texto) {
    var m = String(texto || '').match(_RE_IMGBB_DIRECTO);
    return m ? m[0] : '';
}

function _estadoUrlImagen(txt, error) {
    var e = document.getElementById('sapUrlImagenEstado');
    if (!e) return;
    e.textContent = txt || '';
    e.classList.toggle('error', !!error);
}

function _limpiarUrlImagen() {
    var input = document.getElementById('inputUrlImagenProducto');
    if (input) input.value = '';
    var prev = document.getElementById('previewUrlImagenProducto');
    if (prev) { prev.style.display = 'none'; prev.removeAttribute('src'); }
    _estadoUrlImagen('');
}

function alCambiarUrlImagen() {
    var input = document.getElementById('inputUrlImagenProducto');
    var prev = document.getElementById('previewUrlImagenProducto');
    if (!input) return;
    var crudo = input.value.trim();

    if (crudo === '') {
        _estadoUrlImagen('');
        if (prev) { prev.style.display = 'none'; prev.removeAttribute('src'); }
        _renderExtrasProducto();
        validarFormularioProducto();
        return;
    }

    var url = _extraerUrlImgbb(crudo);
    if (!url) {
        if (prev) { prev.style.display = 'none'; prev.removeAttribute('src'); }
        var esPagina = /^https?:\/\/(www\.)?ibb\.co\//i.test(crudo);
        _estadoUrlImagen(esPagina
            ? 'Ese es el link de la página. En imgbb copia el "Enlace directo" (https://i.ibb.co/...).'
            : 'El link debe ser de imgbb y empezar con https://i.ibb.co/', true);
        _renderExtrasProducto();
        validarFormularioProducto();
        return;
    }

    // Si pegó código embed, se deja solo el link limpio
    if (url !== crudo) input.value = url;

    // El link reemplaza cualquier foto elegida del dispositivo (y su edición)
    if (_principalElegida || _imagenProductoSeleccionada) {
        if (window.editorImagenProducto) window.editorImagenProducto.reset();
        _imagenProductoSeleccionada = null;
        _principalElegida = false;
        var pf = document.getElementById('previewImagenProducto');
        if (pf) { pf.style.display = 'none'; pf.removeAttribute('src'); }
        _estadoImagen('');
    }

    _estadoUrlImagen('Cargando vista previa…');
    if (prev) {
        prev.onload = function () { _estadoUrlImagen('✔ Imagen lista. Se usará este link como imagen principal.'); };
        prev.onerror = function () { prev.style.display = 'none'; _estadoUrlImagen('No se pudo cargar la imagen. Revisa que el link sea correcto.', true); };
        prev.src = url;
        prev.style.display = 'block';
    }
    _renderExtrasProducto();
    validarFormularioProducto();
}

// ── Video de YouTube → link embed (el servidor solo acepta https://www.youtube.com/embed/ID) ──
// Devuelve '' si está vacío, el link embed si es válido o null si no se reconoce.
function _videoAEmbed(texto) {
    var t = String(texto || '').trim();
    if (!t) return '';
    var m = t.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^"'\s]*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    return m ? 'https://www.youtube.com/embed/' + m[1] : null;
}

// ── Comunicación con el Apps Script de Polo ──
async function _postAppsScript(cuerpo) {
    var url = CONFIG.APPS_SCRIPT_URL;
    var respuesta;
    try {
        respuesta = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS con Apps Script
            body: JSON.stringify(cuerpo)
        });
    } catch (e) {
        console.error('[apps script polo] No hubo respuesta:', e);
        var errRed = new Error('No se pudo contactar al servidor. Revisa tu internet y que el Apps Script esté implementado con acceso "Cualquier usuario".');
        errRed.reintentable = true;
        throw errRed;
    }
    var texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch (eJson) {
        console.error('[apps script polo] La respuesta no es JSON (HTTP ' + respuesta.status + '):', texto.slice(0, 600));
        var errJson = new Error('El servidor respondió algo inesperado (HTTP ' + respuesta.status + '). Revisa que CodePolo.gs tenga la última versión implementada.');
        errJson.reintentable = respuesta.status >= 500;
        throw errJson;
    }
}

// Sube las fotos adicionales a imgbb (vía Apps Script), de UNA en una (varias a la vez hacen que imgbb
// responda "forbidden"), y devuelve sus links EN ORDEN. Un solo reintento si fue fallo de red / 5xx.
async function _subirImagenesExtraProducto(idToken, progreso) {
    var items = _imagenesExtraProducto.slice();
    var urls = [];
    for (var i = 0; i < items.length; i++) {
        var intento = 0, url = '';
        while (!url) {
            try {
                var j = await _postAppsScript({
                    idToken: idToken,
                    accion: 'subirImagen',
                    imagenBase64: items[i].dataUrl,
                    nombreArchivo: 'producto_' + Date.now() + '_' + (i + 2) + '.jpg'
                });
                if (j && j.ok && j.url) { url = j.url; break; }
                throw new Error((j && j.error) || 'imgbb no aceptó la foto.'); // motivo claro: reintentar no ayuda
            } catch (e) {
                intento++;
                if (e && e.reintentable && intento < 2) continue;
                throw new Error('Foto ' + (i + 2) + ': ' + (e && e.message ? e.message : 'error desconocido.'));
            }
        }
        urls.push(url);
        if (progreso) progreso(i + 1, items.length);
    }
    return urls;
}

// ── Guardar ──
async function guardarProductoAdmin() {
    if (_guardandoProducto) return;
    var user = auth.currentUser;
    if (!esCorreoAdmin(user)) { mostrarToast('No tienes permisos de administrador.'); return; }

    var nombre = _campoProducto('inputNombreProducto');
    var precioOriginal = _campoProducto('inputPrecioOriginal');
    if (!nombre || precioOriginal === '' || isNaN(Number(precioOriginal)) || Number(precioOriginal) < 0) {
        mostrarToast('Escribe el nombre y un precio original válido.');
        return;
    }
    var etiquetas = obtenerEtiquetasPrincipales();
    if (!etiquetas.length) { mostrarToast('Elige al menos una etiqueta principal.'); return; }
    agregarSubEtiquetaProducto(); // si dejó una sub-etiqueta escrita sin presionar "Agregar", no se pierde

    var urlImagen = _campoProducto('inputUrlImagenProducto');
    if (urlImagen !== '') {
        urlImagen = _extraerUrlImgbb(urlImagen);
        if (!urlImagen) { mostrarToast('El link de la imagen debe ser de imgbb (https://i.ibb.co/...).'); return; }
    }
    if (!_imagenProductoSeleccionada && !urlImagen) { mostrarToast('Agrega la imagen principal del producto.'); return; }

    var precioBazar = _campoProducto('inputPrecioBazar');
    if (precioBazar !== '' && (isNaN(Number(precioBazar)) || Number(precioBazar) < 0)) {
        mostrarToast('El precio de mayoreo no es válido.');
        return;
    }
    var alto = _campoProducto('inputAltoProducto'), ancho = _campoProducto('inputAnchoProducto');
    if ((alto !== '' && (isNaN(Number(alto)) || Number(alto) < 0)) || (ancho !== '' && (isNaN(Number(ancho)) || Number(ancho) < 0))) {
        mostrarToast('Las medidas no son válidas.');
        return;
    }
    var video = _videoAEmbed(_campoProducto('inputVideoProducto'));
    if (video === null) { mostrarToast('El video debe ser un link de YouTube.'); return; }
    var existencia = _campoProducto('inputExistenciaProducto');
    if (existencia !== '' && (isNaN(Number(existencia)) || Number(existencia) < 0)) {
        mostrarToast('La existencia no es válida.');
        return;
    }
    if (_procesandoFotosProducto) { mostrarToast('Espera a que termine de preparar las fotos.'); return; }
    var ed = window.editorImagenProducto;
    if (ed && ed.ocupado()) { mostrarToast('Espera a que termine de quitar el fondo.'); return; }
    if (ed && !urlImagen && ed.tituloPendiente()) { mostrarToast('Presiona "Aplicar" para actualizar el título en la imagen.'); return; }
    if (!CONFIG.APPS_SCRIPT_URL) { mostrarToast('Falta configurar APPS_SCRIPT_URL en config.js.'); return; }

    var btn = document.getElementById('btnGuardarProducto');
    _guardandoProducto = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
        // El idToken prueba, del lado del servidor, quién es realmente el usuario
        var idToken = await user.getIdToken();

        // Fotos adicionales: primero se suben a imgbb (una petición por foto); el guardado solo recibe los links
        var imagenesExtraUrls = [];
        if (_imagenesExtraProducto.length) {
            try {
                imagenesExtraUrls = await _subirImagenesExtraProducto(idToken, function (n, total) {
                    if (btn) btn.textContent = 'Subiendo fotos ' + n + '/' + total + '…';
                });
            } catch (errSub) {
                mostrarToast('❌ ' + (errSub && errSub.message ? errSub.message : 'No se pudieron subir las fotos adicionales.') + ' No se guardó el producto.', 6000);
                return;
            }
            if (btn) btn.textContent = 'Guardando...';
        }

        var resultado = await _postAppsScript({
            idToken: idToken,
            accion: 'agregar',
            nombre: nombre,
            precioOriginal: precioOriginal,
            precioBazar: precioBazar,
            descripcion: _campoProducto('inputDescripcionProducto'),
            etiquetas: etiquetas,
            subEtiquetas: _subEtiquetasProducto.slice(),
            alto: alto,
            ancho: ancho,
            video: video,
            existencia: existencia,
            enOferta: _toggleProductoActivo('btnEnOfertaProducto'),
            masVendido: _toggleProductoActivo('btnMasVendidoProducto'),
            imagenUrl: urlImagen,
            imagenBase64: urlImagen ? '' : (_imagenProductoSeleccionada || ''),
            imagenesExtra: imagenesExtraUrls,
            nombreArchivo: 'producto_' + Date.now() + '.webp'
        });

        if (resultado.ok) {
            mostrarToast('✅ Producto agregado en la fila ' + resultado.fila + ' de la hoja de Polo. Recarga la página en unos segundos para verlo.', 6000);
            limpiarFormularioProducto();
            cerrarSubmenuAgregarProducto();
        } else {
            mostrarToast('❌ ' + (resultado.error || 'No se pudo guardar el producto.'), 6000);
        }
    } catch (err) {
        console.error('[guardar producto polo]', err);
        mostrarToast('❌ Error al guardar: ' + (err && err.message ? err.message : 'conexión'), 6000);
    } finally {
        _guardandoProducto = false;
        if (btn) btn.textContent = 'Guardar';
        validarFormularioProducto();
    }
}

// El editor de imagen terminó de (re)dibujar o se reinició: se actualiza el botón de imagen y "Guardar"
document.addEventListener('editorImagenCambio', function () {
    _renderExtrasProducto();
    validarFormularioProducto();
});
