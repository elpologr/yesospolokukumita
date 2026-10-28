// ══════════════════════════════════════════════════════════════════════════════
// YESOS POLO KUKÚMITA — Agregar producto (solo administradores)
// Se carga DESPUÉS de app.js (usa: auth, esCorreoAdmin, mostrarToast y CONFIG).
//
// Paso 2 (formulario básico): imagen principal (archivo o link de imgbb), nombre, precios,
// medidas, descripción, video, existencia, oferta, más vendido y etiqueta principal.
// Todavía NO incluye: fotos adicionales, editor de imagen, configurar/mover producto,
// ni etiquetas de evento / forma / etiquetas nuevas (vienen en los siguientes pasos).
//
// La seguridad real está en el servidor (CodePolo.gs): vuelve a verificar el idToken de Firebase
// y el correo contra CORREOS_ADMIN. Aquí solo se muestra u oculta el botón.
// ══════════════════════════════════════════════════════════════════════════════

var _imagenProductoSeleccionada = null; // dataURL (JPEG) de la foto elegida
var _guardandoProducto = false;

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
             && hayImagen && obtenerEtiquetasPrincipales().length > 0 && !_guardandoProducto;
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
    var pf = document.getElementById('previewImagenProducto');
    if (pf) { pf.style.display = 'none'; pf.removeAttribute('src'); }
    var pu = document.getElementById('previewUrlImagenProducto');
    if (pu) { pu.style.display = 'none'; pu.removeAttribute('src'); }
    _estadoUrlImagen('');
    _estadoImagen('');
    _pintarBotonImagen();
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

// ── Imagen principal: foto del dispositivo ──
function elegirImagenProducto() {
    var input = document.getElementById('inputImagenProducto');
    if (input) input.click();
}

function _pintarBotonImagen() {
    var t = document.getElementById('sapBtnImagenTitulo');
    var sub = document.getElementById('sapBtnImagenSub');
    if (!t) return;
    var hay = !!_imagenProductoSeleccionada;
    t.textContent = hay ? 'Elegir otra imagen' : 'Agregar imagen';
    if (sub) sub.textContent = hay ? 'Reemplaza la imagen elegida' : 'Se reduce y se sube a ImgBB al guardar';
}

// Reduce la foto (máx. maxLado px) y la devuelve como JPEG en base64
function _leerImagenProducto(archivo, maxLado, calidad) {
    return new Promise(function (resolve, reject) {
        var lector = new FileReader();
        lector.onerror = function () { reject(new Error('lectura')); };
        lector.onload = function (e) {
            var img = new Image();
            img.onload = function () {
                var escala = Math.min(1, maxLado / Math.max(img.width, img.height));
                var canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * escala);
                canvas.height = Math.round(img.height * escala);
                var ctx = canvas.getContext('2d');
                ctx.fillStyle = '#fff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', calidad));
            };
            img.onerror = function () { reject(new Error('imagen')); };
            img.src = e.target.result;
        };
        lector.readAsDataURL(archivo);
    });
}

async function previsualizarImagenProducto(event) {
    var input = event.target;
    var archivo = input.files && input.files[0];
    if (!archivo) return;
    _estadoImagen('Preparando la imagen…');
    try {
        var dataUrl = await _leerImagenProducto(archivo, 1200, 0.88);
        _imagenProductoSeleccionada = dataUrl;
        // La foto reemplaza cualquier link pegado (para no subir las dos)
        _limpiarUrlImagen();
        var pf = document.getElementById('previewImagenProducto');
        if (pf) { pf.src = dataUrl; pf.style.display = 'block'; }
        _estadoImagen('✔ Imagen lista. Se subirá a imgbb al guardar.');
    } catch (e) {
        _imagenProductoSeleccionada = null;
        _estadoImagen('No se pudo leer esa imagen. Prueba con otra.', true);
    }
    input.value = ''; // permite volver a elegir el mismo archivo
    _pintarBotonImagen();
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
        validarFormularioProducto();
        return;
    }

    // Si pegó código embed, se deja solo el link limpio
    if (url !== crudo) input.value = url;

    // El link reemplaza cualquier foto elegida del dispositivo
    if (_imagenProductoSeleccionada) {
        _imagenProductoSeleccionada = null;
        var pf = document.getElementById('previewImagenProducto');
        if (pf) { pf.style.display = 'none'; pf.removeAttribute('src'); }
        _estadoImagen('');
        _pintarBotonImagen();
    }

    _estadoUrlImagen('Cargando vista previa…');
    if (prev) {
        prev.onload = function () { _estadoUrlImagen('✔ Imagen lista. Se usará este link como imagen principal.'); };
        prev.onerror = function () { prev.style.display = 'none'; _estadoUrlImagen('No se pudo cargar la imagen. Revisa que el link sea correcto.', true); };
        prev.src = url;
        prev.style.display = 'block';
    }
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
        throw new Error('No se pudo contactar al servidor. Revisa tu internet y que el Apps Script esté implementado con acceso "Cualquier usuario".');
    }
    var texto = await respuesta.text();
    try {
        return JSON.parse(texto);
    } catch (eJson) {
        console.error('[apps script polo] La respuesta no es JSON (HTTP ' + respuesta.status + '):', texto.slice(0, 600));
        throw new Error('El servidor respondió algo inesperado (HTTP ' + respuesta.status + '). Revisa que CodePolo.gs tenga la última versión implementada.');
    }
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
    if (!CONFIG.APPS_SCRIPT_URL) { mostrarToast('Falta configurar APPS_SCRIPT_URL en config.js.'); return; }

    var btn = document.getElementById('btnGuardarProducto');
    _guardandoProducto = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    try {
        // El idToken prueba, del lado del servidor, quién es realmente el usuario
        var idToken = await user.getIdToken();
        var resultado = await _postAppsScript({
            idToken: idToken,
            accion: 'agregar',
            nombre: nombre,
            precioOriginal: precioOriginal,
            precioBazar: precioBazar,
            descripcion: _campoProducto('inputDescripcionProducto'),
            etiquetas: etiquetas,
            alto: alto,
            ancho: ancho,
            video: video,
            existencia: existencia,
            enOferta: _toggleProductoActivo('btnEnOfertaProducto'),
            masVendido: _toggleProductoActivo('btnMasVendidoProducto'),
            imagenUrl: urlImagen,
            imagenBase64: urlImagen ? '' : (_imagenProductoSeleccionada || ''),
            nombreArchivo: 'producto_' + Date.now() + '.jpg'
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
