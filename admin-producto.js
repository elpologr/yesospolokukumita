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
// Paso 4b: configurar (editar) y mover producto, solo administradores. Desde el modal de un producto del
// catálogo de Polo: "⚙️ Editar" abre este mismo formulario con los datos del producto (modo edición) y
// "↕️ Mover" abre un diálogo para cambiar su lugar en la hoja. El servidor (CodePolo.gs) comprueba por nombre
// que la fila siga siendo ese producto; si la hoja cambió, no toca nada.
//
// La seguridad real está en el servidor (CodePolo.gs): vuelve a verificar el idToken de Firebase
// y el correo contra CORREOS_ADMIN. Aquí solo se muestra u oculta el botón.
// ══════════════════════════════════════════════════════════════════════════════

var _imagenProductoSeleccionada = null; // dataURL de la imagen principal final (la arma editor-imagen.js)
var _principalElegida = false;
var _subEtiquetasProducto = [];         // sub-etiquetas elegidas (columna H), en minúsculas y sin repetir
var MAX_SUBETIQUETAS = 15;          // true desde que se elige una foto, aunque el editor aún la esté armando
var _guardandoProducto = false;

// Modo edición (paso 4b)
var _edicionProducto = null;       // null = agregando; { fila, nombre, etiquetasExtra: [], medidasTexto: '' } = editando
var _imagenesExistentes = [];      // links de imgbb que el producto ya tiene en la hoja (la 1ª es la principal)
var _filasEditadas = {};           // filas que ya se guardaron en esta sesión (hay que recargar antes de volver a editarlas)
var _catalogoMovido = false;       // true si se movió un producto: los números de fila de la página ya no valen

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
    if (_edicionProducto) { limpiarFormularioProducto(); _salirModoEdicion(); } // venía de editar: empezar limpio
    sub.classList.add('abierto');
    sub.scrollTop = 0;
    _llenarSugerenciasSubEtiquetas();
    document.body.style.overflow = 'hidden';
    validarFormularioProducto();
}

function cerrarSubmenuAgregarProducto() {
    var sub = document.getElementById('submenuAgregarProducto');
    if (!sub || !sub.classList.contains('abierto')) return;
    if (_edicionProducto && _guardandoProducto) { mostrarToast('Espera a que termine de guardar.'); return; }
    sub.classList.remove('abierto');
    // Al cerrar una edición sin guardar se descartan los cambios (lo escrito en "Agregar" sí se conserva)
    if (_edicionProducto) { limpiarFormularioProducto(); _salirModoEdicion(); }
    // La pantalla de perfil o el modal del producto siguen abiertos debajo: mantener el scroll de fondo bloqueado
    var perfil = document.getElementById('pantallaPerfil');
    var modalProd = document.getElementById('modalProducto');
    var hayDebajo = (perfil && perfil.classList.contains('activo')) || (modalProd && modalProd.classList.contains('abierto'));
    if (!hayDebajo) document.body.style.overflow = '';
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
    // Al editar: etiquetas que ya tenía la hoja y que no tienen botón aquí (ej. "arreglo") se conservan
    if (_edicionProducto) _edicionProducto.etiquetasExtra.forEach(function (t) { if (lista.indexOf(t) === -1) lista.push(t); });
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
    var hayImagen = _imagenPrincipalLista();
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
    _imagenesExistentes = [];
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
    return _hayPrincipalNueva() || _imagenesExistentes.length > 0;
}

// ¿Se eligió una imagen principal NUEVA en este formulario (foto o link de imgbb)?
function _hayPrincipalNueva() {
    return _principalElegida || !!_imagenProductoSeleccionada || !!_extraerUrlImgbb(_campoProducto('inputUrlImagenProducto'));
}

// ¿La imagen principal ya está lista para guardarse? (link pegado, imagen del editor ya armada o, al editar, la que ya tenía)
function _imagenPrincipalLista() {
    if (_extraerUrlImgbb(_campoProducto('inputUrlImagenProducto'))) return true;
    if (_principalElegida) return !!_imagenProductoSeleccionada;
    return !!_imagenProductoSeleccionada || _imagenesExistentes.length > 0;
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
    // Una principal nueva reemplaza a la ★ que ya tenía (si la tenía); si no tenía, suma una
    return _imagenesExistentes.length + _imagenesExtraProducto.length + ((_hayPrincipalNueva() && !_imagenesExistentes.length) ? 1 : 0);
}

function _estadoExtrasProducto(t) {
    var e = document.getElementById('sapExtrasEstado');
    if (e) e.textContent = t || '';
}

function _renderExtrasProducto() {
    _pintarBotonImagen();
    _renderExistentesProducto();
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
    if (_principalElegida && !_imagenProductoSeleccionada && !urlImagen) { mostrarToast('Espera a que termine de armarse la imagen principal.'); return; }
    if (!_imagenProductoSeleccionada && !urlImagen && !(_edicionProducto && _imagenesExistentes.length)) { mostrarToast('Agrega la imagen principal del producto.'); return; }

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

    // Modo edición: se actualiza la fila existente en vez de agregar una nueva
    if (_edicionProducto) {
        await _guardarEdicionProducto(user, {
            nombre: nombre, precioOriginal: precioOriginal, precioBazar: precioBazar, alto: alto, ancho: ancho,
            video: video, existencia: existencia, etiquetas: etiquetas, urlImagen: urlImagen
        });
        return;
    }

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
        if (btn) btn.textContent = _textoBtnGuardar();
        validarFormularioProducto();
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// PASO 4b — CONFIGURAR (EDITAR) Y MOVER PRODUCTO
// ══════════════════════════════════════════════════════════════════════════════

function _textoBtnGuardar() { return _edicionProducto ? 'Guardar cambios' : 'Guardar'; }

// Avisa (y devuelve true) si la página ya no tiene filas confiables hasta recargar
function _adminBloqueado(fila) {
    if (_catalogoMovido) {
        mostrarToast('Moviste un producto: recarga la página antes de seguir (los números de fila cambiaron).', 5000);
        return true;
    }
    if (fila && _filasEditadas[fila]) {
        mostrarToast('Ya guardaste cambios en este producto. Recarga la página para ver los datos nuevos antes de volver a editarlo.', 5000);
        return true;
    }
    return false;
}

// Tras editar o mover: la copia guardada del catálogo (caché de 3 min) ya no sirve
function _limpiarCacheCatalogo() {
    try {
        Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf('kukumita_csv') === 0) sessionStorage.removeItem(k); });
    } catch (e) {}
}

// Título y textos del formulario según agregue o edite
function _pintarModoEdicion() {
    var editando = !!_edicionProducto;
    var t = document.getElementById('sapTitulo');
    if (t) t.textContent = editando ? 'Configurar producto' : 'Agregar producto';
    var g = document.getElementById('btnGuardarProducto');
    if (g && !_guardandoProducto) g.textContent = _textoBtnGuardar();
    var bloque = document.getElementById('sapExistentesBloque');
    if (bloque) bloque.style.display = (editando && _imagenesExistentes.length) ? '' : 'none';
    var notaE = document.getElementById('sapEtiquetasExtraNota');
    if (notaE) {
        var extra = editando ? _edicionProducto.etiquetasExtra : [];
        notaE.style.display = extra.length ? '' : 'none';
        notaE.textContent = extra.length ? 'Además conserva estas etiquetas que ya tenía en la hoja: ' + extra.join(', ') + '.' : '';
    }
    var notaM = document.getElementById('sapMedidasTextoNota');
    if (notaM) {
        var mt = editando ? _edicionProducto.medidasTexto : '';
        notaM.style.display = mt ? '' : 'none';
        notaM.textContent = mt ? 'En la hoja las medidas dicen «' + mt + '». Déjalas vacías aquí para conservarlas tal cual, o llena alto/ancho para reemplazarlas.' : '';
    }
}

function _salirModoEdicion() {
    _edicionProducto = null;
    _imagenesExistentes = [];
    _pintarModoEdicion();
    _renderExtrasProducto();
    validarFormularioProducto();
}

// Miniaturas de las imágenes que el producto ya tiene (modo edición)
function _renderExistentesProducto() {
    var lista = document.getElementById('sapExistentesLista');
    var bloque = document.getElementById('sapExistentesBloque');
    if (bloque) bloque.style.display = (_edicionProducto && _imagenesExistentes.length) ? '' : 'none';
    if (!lista) return;
    lista.innerHTML = '';
    var reemplazada = _hayPrincipalNueva();
    _imagenesExistentes.forEach(function (url, i) {
        var caja = document.createElement('div');
        caja.className = 'sap-extra' + ((i === 0 && reemplazada) ? ' reemplazada' : '');
        var img = document.createElement('img');
        img.src = url;
        img.alt = i === 0 ? 'Imagen principal' : 'Foto ' + (i + 1);
        img.loading = 'lazy';
        var num = document.createElement('span');
        num.textContent = i === 0 ? '★' : String(i + 1);
        var quitar = document.createElement('button');
        quitar.type = 'button';
        quitar.setAttribute('aria-label', 'Quitar imagen ' + (i + 1));
        quitar.textContent = '✕';
        quitar.addEventListener('click', function () {
            if (_guardandoProducto) return;
            _imagenesExistentes.splice(i, 1);
            _renderExtrasProducto();
            validarFormularioProducto();
        });
        caja.appendChild(img); caja.appendChild(num); caja.appendChild(quitar);
        lista.appendChild(caja);
    });
}

// "12/8" → alto 12, ancho 8. Texto que no tiene ese formato (ej. "20 cm") se conserva aparte.
function _separarMedidasProducto(txt) {
    var m = String(txt || '').trim();
    if (!m) return { alto: '', ancho: '', texto: '' };
    var mm = m.match(/^(\d+(?:\.\d+)?)?\s*\/\s*(\d+(?:\.\d+)?)?$/);
    if (mm) return { alto: mm[1] || '', ancho: mm[2] || '', texto: '' };
    return { alto: '', ancho: '', texto: m };
}

function _atributoCard(card, nombre) { return card.getAttribute(nombre) || ''; }

// Abre el formulario con los datos del producto que está abierto en el modal
function abrirSubmenuEditarProducto() {
    var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!esCorreoAdmin(user)) return; // por si acaso; el servidor vuelve a verificar
    var datos = (typeof _datosProductoEliminable === 'function') ? _datosProductoEliminable() : null;
    var card = window._cardModalActual;
    if (!datos || !card) { mostrarToast('Este producto no se puede editar desde aquí.'); return; }
    if (_adminBloqueado(datos.fila)) return;
    if (!CONFIG.APPS_SCRIPT_URL) { mostrarToast('Falta configurar APPS_SCRIPT_URL en config.js.'); return; }

    limpiarFormularioProducto(); // parte de un formulario limpio (descarta lo que hubiera escrito en "Agregar")

    // ── Datos de la tarjeta ──
    var imgs = [];
    try { imgs = JSON.parse(_atributoCard(card, 'data-imagenes') || '[]'); } catch (e) { imgs = []; }
    imgs = (Array.isArray(imgs) ? imgs : []).map(function (u) { return String(u).trim(); }).filter(Boolean);

    var tipos = _atributoCard(card, 'data-tipos').split('|').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
    var chips = {};
    document.querySelectorAll('#chipsEtiquetaPrincipal .sap-chip').forEach(function (b) { chips[b.getAttribute('data-valor')] = b; });
    var extra = [];
    tipos.forEach(function (t) {
        if (chips[t]) { chips[t].classList.add('activo'); chips[t].setAttribute('aria-pressed', 'true'); }
        else if (extra.indexOf(t) === -1) extra.push(t);
    });

    var med = _separarMedidasProducto(_atributoCard(card, 'data-alto'));
    _edicionProducto = { fila: datos.fila, nombre: datos.nombre, etiquetasExtra: extra, medidasTexto: med.texto };
    _imagenesExistentes = imgs;

    function poner(id, v) { var el = document.getElementById(id); if (el) el.value = v; }
    poner('inputNombreProducto', datos.nombre);
    poner('inputPrecioOriginal', _atributoCard(card, 'data-precio-exacto') || _atributoCard(card, 'data-precio'));
    poner('inputPrecioBazar', _atributoCard(card, 'data-precio-bazar-exacto') || _atributoCard(card, 'data-precio-bazar'));
    poner('inputDescripcionProducto', _atributoCard(card, 'data-descripcion'));
    poner('inputAltoProducto', med.alto);
    poner('inputAnchoProducto', med.ancho);
    poner('inputVideoProducto', _atributoCard(card, 'data-video'));
    var ex = parseInt(_atributoCard(card, 'data-existencia'), 10);
    poner('inputExistenciaProducto', (isFinite(ex) && ex > 0) ? String(ex) : '');

    [['btnEnOfertaProducto', 'data-oferta'], ['btnMasVendidoProducto', 'data-mas-vendido']].forEach(function (par) {
        var b = document.getElementById(par[0]);
        if (b && _atributoCard(card, par[1]) === '1') {
            b.classList.add('activo'); b.setAttribute('aria-pressed', 'true');
            var t = b.querySelector('.sap-toggle-estado'); if (t) t.textContent = 'Sí';
        }
    });

    _subEtiquetasProducto = [];
    _atributoCard(card, 'data-subtags').split('|').forEach(function (t) {
        t = _normalizarSubEtiqueta(t);
        if (t && _subEtiquetasProducto.indexOf(t) === -1 && _subEtiquetasProducto.length < MAX_SUBETIQUETAS) _subEtiquetasProducto.push(t);
    });
    _renderSubEtiquetas();

    _pintarModoEdicion();
    _renderExtrasProducto();
    _estadoImagen(imgs.length ? 'Estas son las imágenes actuales. Si no eliges otra imagen principal, se conserva la ★.' : '');

    var sub = document.getElementById('submenuAgregarProducto');
    if (!sub) return;
    sub.classList.add('abierto');
    sub.scrollTop = 0;
    _llenarSugerenciasSubEtiquetas();
    document.body.style.overflow = 'hidden';
    validarFormularioProducto();
}

// Sube UNA imagen a imgbb (vía Apps Script) con un reintento si fue fallo de red / 5xx. Devuelve el link.
async function _subirUnaImagenProducto(idToken, dataUrl, nombreArchivo, etiqueta) {
    var intento = 0;
    while (true) {
        try {
            var j = await _postAppsScript({ idToken: idToken, accion: 'subirImagen', imagenBase64: dataUrl, nombreArchivo: nombreArchivo });
            if (j && j.ok && j.url) return j.url;
            throw new Error((j && j.error) || 'imgbb no aceptó la imagen.');
        } catch (e) {
            intento++;
            if (e && e.reintentable && intento < 2) continue;
            throw new Error(etiqueta + ': ' + (e && e.message ? e.message : 'error desconocido.'));
        }
    }
}

// Guarda los cambios de un producto existente
async function _guardarEdicionProducto(user, v) {
    var edicion = _edicionProducto;
    if (!edicion) return;
    var btn = document.getElementById('btnGuardarProducto');
    _guardandoProducto = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
        var idToken = await user.getIdToken(true); // token recién renovado: evita "sesión expirada"

        // 1) Imagen principal nueva: link pegado o imagen armada en el editor (se sube a imgbb)
        var principalNueva = '';
        if (v.urlImagen) {
            principalNueva = v.urlImagen;
        } else if (_imagenProductoSeleccionada) {
            if (btn) btn.textContent = 'Subiendo imagen principal…';
            try {
                principalNueva = await _subirUnaImagenProducto(idToken, _imagenProductoSeleccionada, 'producto_' + Date.now() + '.webp', 'Imagen principal');
            } catch (errP) {
                mostrarToast('❌ ' + errP.message + ' No se guardó nada.', 6000);
                return;
            }
        }

        // 2) Fotos adicionales nuevas (una por una)
        var extrasUrls = [];
        if (_imagenesExtraProducto.length) {
            try {
                extrasUrls = await _subirImagenesExtraProducto(idToken, function (n, total) {
                    if (btn) btn.textContent = 'Subiendo fotos ' + n + '/' + total + '…';
                });
            } catch (errSub) {
                mostrarToast('❌ ' + (errSub && errSub.message ? errSub.message : 'No se pudieron subir las fotos adicionales.') + ' No se guardó nada.', 6000);
                return;
            }
        }
        if (btn) btn.textContent = 'Guardando...';

        // 3) Lista final: la principal nueva reemplaza a la ★ actual; las demás actuales se conservan; luego las nuevas
        var imagenes = principalNueva
            ? [principalNueva].concat(_imagenesExistentes.slice(1))
            : _imagenesExistentes.slice();
        imagenes = imagenes.concat(extrasUrls);
        if (!imagenes.length) { mostrarToast('El producto necesita al menos una imagen.'); return; }
        if (imagenes.length > MAX_IMAGENES_PRODUCTO) { mostrarToast('Máximo ' + MAX_IMAGENES_PRODUCTO + ' imágenes por producto.'); return; }

        var resultado = await _postAppsScript({
            idToken: idToken,
            accion: 'editar',
            fila: edicion.fila,
            nombreOriginal: edicion.nombre, // el servidor comprueba que la fila siga siendo este producto
            nombre: v.nombre,
            precioOriginal: v.precioOriginal,
            precioBazar: v.precioBazar,
            descripcion: _campoProducto('inputDescripcionProducto'),
            etiquetas: v.etiquetas,
            subEtiquetas: _subEtiquetasProducto.slice(),
            alto: v.alto,
            ancho: v.ancho,
            medidasTexto: edicion.medidasTexto,
            video: v.video,
            existencia: v.existencia,
            enOferta: _toggleProductoActivo('btnEnOfertaProducto'),
            masVendido: _toggleProductoActivo('btnMasVendidoProducto'),
            imagenes: imagenes
        });

        if (resultado.ok) {
            _filasEditadas[edicion.fila] = true;
            _limpiarCacheCatalogo();
            mostrarToast('✅ «' + (resultado.nombre || v.nombre) + '» actualizado en la fila ' + edicion.fila + '. Recarga la página en unos segundos para ver los cambios.', 6000);
            limpiarFormularioProducto();
            _salirModoEdicion();
            cerrarSubmenuAgregarProducto();
            if (typeof cerrarModalProducto === 'function') cerrarModalProducto();
        } else {
            mostrarToast('❌ ' + (resultado.error || 'No se pudieron guardar los cambios.'), 7000);
        }
    } catch (err) {
        console.error('[editar producto polo]', err);
        mostrarToast('❌ Error al guardar: ' + (err && err.message ? err.message : 'conexión'), 6000);
    } finally {
        _guardandoProducto = false;
        if (btn) btn.textContent = _textoBtnGuardar();
        validarFormularioProducto();
    }
}

// ── Mover / intercambiar producto de fila (mismo sistema que Yesos Fer) ──
// El número "# N" de cada producto es su fila en la hoja. Para mover un producto se escribe la fila destino:
//  • si esa fila está ocupada, los dos productos se INTERCAMBIAN;
//  • si está libre, el producto se mueve ahí y su fila anterior queda vacía;
//  • si se deja vacía, pasa a la última fila disponible.
var FILA_MIN_DESTINO = 2;         // la fila 1 son los encabezados
var FILA_MAX_DESTINO = 1000;      // igual que FILA_MAX en CodePolo.gs
var FILA_RESERVADA_INI = 26;      // filas 26-31: productos "prestados" de Etiquetas y Velas
var FILA_RESERVADA_FIN_ = 31;     // igual que FILA_RESERVADA_FIN en CodePolo.gs

var _moverProducto = null;   // { fila, nombre } del producto que se está por mover
var _moviendoProducto = false;

// Devuelve un texto de error si la fila no se puede usar, o '' si está bien.
function _errorFilaDestino(n) {
    if (!isFinite(n) || Math.floor(n) !== n) return 'Escribe un número de fila entero.';
    if (n < FILA_MIN_DESTINO) return 'La fila 1 son los encabezados. Elige la fila 2 o una mayor.';
    if (n > FILA_MAX_DESTINO) return 'La fila máxima permitida es la ' + FILA_MAX_DESTINO + '.';
    if (n >= FILA_RESERVADA_INI && n <= FILA_RESERVADA_FIN_) {
        return 'Las filas ' + FILA_RESERVADA_INI + ' a ' + FILA_RESERVADA_FIN_ + ' están reservadas (Etiquetas y Velas). Elige otra.';
    }
    return '';
}

// Producto de Polo que está ahora en la fila n de la hoja (o undefined si está libre)
function _productoEnFila(n) {
    return (typeof listaProductos !== 'undefined' ? listaProductos : []).filter(function (p) {
        return !p._origenExterno && (p.id + 1) === n;
    })[0];
}

// Botones − / + del campo de fila. Vacío = "última fila disponible".
function ajustarFilaMover(delta) {
    var el = document.getElementById('inputMoverFila');
    if (!el) return;
    var actual = parseInt(el.value, 10);
    if (isNaN(actual)) {
        if (delta > 0) el.value = String(FILA_MIN_DESTINO);
    } else {
        var nuevo = actual + delta;
        el.value = nuevo < FILA_MIN_DESTINO ? '' : String(Math.min(FILA_MAX_DESTINO, nuevo));
    }
    actualizarAvisoMover();
}

function abrirMoverProducto() {
    var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!esCorreoAdmin(user)) return; // por si acaso; el servidor vuelve a verificar
    var datos = (typeof _datosProductoEliminable === 'function') ? _datosProductoEliminable() : null;
    if (!datos) { mostrarToast('Este producto no se puede mover desde aquí.'); return; }
    if (_adminBloqueado(datos.fila)) return;
    if (!CONFIG.APPS_SCRIPT_URL) { mostrarToast('Falta configurar APPS_SCRIPT_URL en config.js.'); return; }

    _moverProducto = datos;
    var info = document.getElementById('mmpProducto');
    if (info) info.textContent = '«' + datos.nombre + '» está en la fila ' + datos.fila + '.';
    var input = document.getElementById('inputMoverFila');
    if (input) input.value = '';
    actualizarAvisoMover();
    document.getElementById('modalMoverProducto').classList.add('abierto');
    if (input) setTimeout(function () { input.focus(); }, 50);
}

function cerrarMoverProducto() {
    if (_moviendoProducto) return;
    var m = document.getElementById('modalMoverProducto');
    if (m) m.classList.remove('abierto');
    _moverProducto = null;
}

// Explica en vivo qué va a pasar con la fila escrita y habilita/deshabilita "Mover"
function actualizarAvisoMover() {
    var aviso = document.getElementById('mmpAviso');
    var btn = document.getElementById('btnConfirmarMover');
    if (!aviso || !_moverProducto) return;
    var texto = _campoProducto('inputMoverFila');
    var msg = '', error = false;
    if (texto === '') {
        msg = 'Sin fila elegida: el producto pasará a la última fila disponible de la hoja.';
    } else {
        var n = Number(texto);
        var err = _errorFilaDestino(n);
        if (err) { msg = err; error = true; }
        else if (n === _moverProducto.fila) { msg = 'El producto ya está en esa fila.'; error = true; }
        else {
            var ocupante = _productoEnFila(n);
            msg = ocupante
                ? 'La fila ' + n + ' está ocupada por «' + ocupante.nombre + '»: se intercambiarán (ese producto pasará a la fila ' + _moverProducto.fila + ').'
                : 'La fila ' + n + ' está libre: el producto se moverá ahí y la fila ' + _moverProducto.fila + ' quedará vacía.';
        }
    }
    aviso.textContent = msg;
    aviso.classList.toggle('error', error);
    if (btn) btn.disabled = error || _moviendoProducto;
}

async function confirmarMoverProducto() {
    if (_moviendoProducto || !_moverProducto) return;
    var user = (typeof auth !== 'undefined') ? auth.currentUser : null;
    if (!esCorreoAdmin(user)) { mostrarToast('No tienes permisos de administrador.'); return; }
    if (_adminBloqueado(_moverProducto.fila)) return;

    var texto = _campoProducto('inputMoverFila');
    var cuerpo = { accion: 'mover', fila: _moverProducto.fila, nombreOriginal: _moverProducto.nombre, filaDestino: texto };
    if (texto !== '') {
        var n = Number(texto);
        var err = _errorFilaDestino(n);
        if (err) { mostrarToast(err); return; }
        if (n === _moverProducto.fila) { mostrarToast('El producto ya está en esa fila.'); return; }
        // El servidor comprueba que en el destino siga lo mismo que ve esta página ('' = esperaba que estuviera libre)
        var ocupante = _productoEnFila(n);
        cuerpo.nombreDestino = ocupante ? String(ocupante.nombre || '').trim() : '';
    }
    if (!CONFIG.APPS_SCRIPT_URL) { mostrarToast('Falta configurar APPS_SCRIPT_URL en config.js.'); return; }

    var btn = document.getElementById('btnConfirmarMover');
    _moviendoProducto = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Moviendo...'; }
    var producto = _moverProducto;
    try {
        cuerpo.idToken = await user.getIdToken(true);
        var r = await _postAppsScript(cuerpo);
        if (r.ok) {
            _catalogoMovido = true; // los números de fila de la página ya no valen hasta recargar
            _limpiarCacheCatalogo();
            _moviendoProducto = false;
            cerrarMoverProducto();
            if (typeof cerrarModalProducto === 'function') cerrarModalProducto();
            mostrarToast(r.intercambio
                ? '✅ Intercambiados: fila ' + r.filaOrigen + ' ↔ fila ' + r.filaDestino + '. Recarga la página en unos segundos.'
                : '✅ «' + (r.nombre || producto.nombre) + '» movido a la fila ' + r.filaDestino + '. Recarga la página en unos segundos.', 6000);
        } else {
            mostrarToast('❌ ' + (r.error || 'No se pudo mover el producto.'), 7000);
        }
    } catch (e) {
        console.error('[mover producto polo]', e);
        mostrarToast('❌ Error al mover: ' + (e && e.message ? e.message : 'conexión'), 6000);
    } finally {
        _moviendoProducto = false;
        if (btn) btn.textContent = 'Mover';
        actualizarAvisoMover();
    }
}

// El editor de imagen terminó de (re)dibujar o se reinició: se actualiza el botón de imagen y "Guardar"
document.addEventListener('editorImagenCambio', function () {
    _renderExtrasProducto();
    validarFormularioProducto();
});
