/*
 * ══════════════════════════════════════════════════════════════
 * YESOS POLO KUKÚMITA — Apps Script (hoja de Polo)
 * 1) Recibe los productos nuevos que se crean en el formulario de Yesos Fer
 *    y los escribe en la hoja de Polo (columnas A–M), subiendo las imágenes
 *    al imgbb de POLO (con la IMGBB_KEY de este proyecto). Se protege con SECRETO_ENLACE.
 * 2) Elimina productos (acción "eliminar"), SOLO para administradores: la página de Polo
 *    manda el idToken de Firebase (proyecto velas-kukumita) y aquí se verifica con Google
 *    y se compara el correo con CORREOS_ADMIN.
 * 2b) Las acciones "agregar" y "subirImagen" también las puede pedir un ADMINISTRADOR desde la
 *    página de Polo (mismo idToken). El secreto de enlace sigue sirviendo solo para el script de Fer
 *    y NUNCA debe ir en el JavaScript de la página.
 * 2c) Solo para ADMINISTRADORES (idToken): "editar" (reescribe las columnas A–M de una fila) y
 *    "mover" (cambia la posición de una fila en la hoja). Ambas, igual que "eliminar", comprueban que
 *    la fila siga siendo el producto que la página creía (por su nombre); si la hoja cambió, no tocan nada.
 *    "mover" tiene dos modos: SIN "posicion" (el de Yesos Fer) cambia el producto a la fila "filaDestino":
 *    si está ocupada los dos se INTERCAMBIAN, si está libre se mueve y su fila anterior queda vacía, y si
 *    "filaDestino" viene vacío pasa a la última fila disponible. Con "posicion" ('inicio' | 'final' | 'antes')
 *    inserta la fila y recorre las demás (modo anterior, se conserva por compatibilidad).
 *
 * 2d) Solo ADMINISTRADORES (idToken): "etiquetasLeer" y "etiquetaAgregar" guardan en las propiedades del script
 *    las etiquetas nuevas (principal, evento, forma) que se crean desde el formulario de agregar producto.
 *
 * Columnas de la hoja de Polo:
 *   A Producto | B Precio Original | C Precio Mayoreo | D Descripcion | E Imagenes imgbb
 *   F Video | G Etiqueta Principal (+ etiquetas de FORMA) | H Sub Etiquetas | I Medidas alto/ancho
 *   J Existencia | K En Oferta | L Mas Vendido | M Etiqueta de Evento
 *   (Las etiquetas de forma —macetas, bases, tazones…— se guardan junto a las principales en la columna G,
 *    porque de ahí las lee el filtro de formas de la página. La columna M es NUEVA: agrega el encabezado
 *    "Etiqueta de Evento" en M1 de la hoja.)
 *
 * ── INSTALACIÓN (una sola vez) ──
 * 1) Abre la hoja de Polo → Extensiones → Apps Script → pega TODO este archivo en Code.gs.
 * 2) ⚙ Configuración del proyecto → Propiedades de la secuencia de comandos → agrega:
 *      IMGBB_KEY        = la API key de imgbb de POLO (api.imgbb.com)
 *      SECRETO_ENLACE   = una clave larga inventada por ti (ej. 40 letras y números al azar)
 *    La MISMA clave se guarda en el script de Fer con el nombre SECRETO_POLO.
 * 3) Implementar → Nueva implementación → Aplicación web:
 *      Ejecutar como: "Yo"   |   Quién tiene acceso: "Cualquier usuario"
 *    Copia la URL que termina en /exec y guárdala en el script de FER como URL_POLO.
 *    (Aunque el acceso sea "Cualquier usuario", sin la clave secreta nadie puede escribir nada.)
 * 4) Cada vez que cambies este archivo: Implementar → Gestionar implementaciones → lápiz →
 *    Nueva versión → Implementar.
 * ══════════════════════════════════════════════════════════════
 */

// ──────────── CONFIGURACIÓN ────────────

var SPREADSHEET_ID = '1LX-jUhxnbWYEQ8aa8cfbmCenWRYLGI8aHlojkfG7oNA'; // hoja de Yesos Polo
var NOMBRE_HOJA    = 'Hoja 1';                                       // pestaña de productos
var MAX_IMAGENES   = 50;                                             // máximo por producto (columna E)
var MAX_EVENTOS    = 20;                                             // máximo de etiquetas de evento por producto (columna M)

// Mover / intercambiar de fila (mismo sistema que Yesos Fer).
var FILA_MAX = 1000;            // fila máxima que se puede elegir como destino
// Filas reservadas: la página las deja libres para los productos "prestados" de Etiquetas y Velas
// (ver FILA_INICIO_ETIQUETAS / FILA_INICIO_VELAS en app.js). No se pueden usar como destino ni mover.
// Si cambias estos números, cámbialos también en admin-producto.js (FILA_RESERVADA_INI / FIN).
var FILA_RESERVADA_INICIO = 26;
var FILA_RESERVADA_FIN    = 31;

// API Key pública del Firebase de Polo (la misma de config.js; no es secreta, solo identifica el proyecto).
var FIREBASE_API_KEY = 'AIzaSyBc_AUz1lfgAPFuQd9oKvDYGm1lyrHALGs';

// Correos que pueden ELIMINAR productos desde la página de Polo. Si agregas uno aquí,
// agrégalo también en CORREOS_ADMIN de config.js (allá solo sirve para mostrar el botón).
var CORREOS_ADMIN = [
    'dulceprincesa086@gmail.com',
    'dulcefernandaguzmanrodriguez@gmail.com',
    'celvaguzman72@gmail.com',
    'celvapreciosa27@gmail.com',
    'velaskuku@gmail.com',
    'yesosferkukumita@gmail.com'
];

// ──────────── PUNTO DE ENTRADA ────────────

function respuesta_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
    var lock = LockService.getScriptLock();
    try {
        if (!e || !e.postData || !e.postData.contents) return respuesta_({ ok: false, error: 'Petición vacía.' });
        var d = JSON.parse(e.postData.contents);

        // ── Ruta de ADMINISTRADOR (página de Polo) ──
        // Si la petición trae idToken se verifica directamente con Google (no se puede falsificar
        // desde el navegador) y el correo debe estar en CORREOS_ADMIN. Aplica a eliminar, editar, mover, agregar y subirImagen.
        if (d.idToken || d.accion === 'eliminar') {
            var aut = autorizarAdmin_(d);
            if (!aut.ok) return respuesta_({ ok: false, error: aut.error });
            if (d.accion === 'eliminar') return eliminarProducto_(d, lock);
            if (d.accion === 'editar') return editarProducto_(d, lock);
            if (d.accion === 'mover') return moverProducto_(d, lock);
            if (d.accion === 'etiquetasLeer') return respuesta_({ ok: true, etiquetas: leerEtiquetasPersonalizadas_() });
            if (d.accion === 'etiquetaAgregar') return agregarEtiquetaPersonalizada_(d, lock);
            if (d.accion !== 'agregar' && d.accion !== 'subirImagen') {
                return respuesta_({ ok: false, error: 'Acción no reconocida.' });
            }
        } else {
            // ── Ruta del script de FER (clave secreta): subir fotos y agregar productos ──
            // Solo el script de Fer (que conoce la clave secreta) puede usar este servicio
            var secreto = PropertiesService.getScriptProperties().getProperty('SECRETO_ENLACE');
            if (!secreto) return respuesta_({ ok: false, error: 'Falta SECRETO_ENLACE en las propiedades del script de Polo.' });
            if (!d.secreto || String(d.secreto) !== secreto) return respuesta_({ ok: false, error: 'Clave de enlace incorrecta.' });
        }

        // Subir UNA foto adicional al imgbb de Polo y devolver su link
        if (d.accion === 'subirImagen') {
            if (!d.imagenBase64) return respuesta_({ ok: false, error: 'Falta la imagen.' });
            return respuesta_({ ok: true, url: subirImagenAImgbb_(d.imagenBase64, d.nombreArchivo) });
        }

        if (d.accion === 'agregar') return agregarProducto_(d, lock);

        return respuesta_({ ok: false, error: 'Acción no reconocida.' });
    } catch (err) {
        return respuesta_({ ok: false, error: 'Error interno (Polo): ' + err.message });
    } finally {
        try { lock.releaseLock(); } catch (x) {}
    }
}

// ──────────── AGREGAR PRODUCTO ────────────

// Valida y limpia los campos que comparten "agregar" y "editar" (todo menos las imágenes).
// Devuelve { error } o { nombre, precioOriginal, precioMayoreo, descripcion, etiquetas, eventos, subEtiquetas, medidas, video, existencia, enOferta, masVendido }.
function validarCamposProducto_(d) {
    var nombre = textoSeguro_(d.nombre, 80);
    if (!nombre) return { error: 'Falta el nombre del producto.' };

    var precioOriginal = Number(d.precioOriginal);
    if (d.precioOriginal === '' || d.precioOriginal == null || !isFinite(precioOriginal) || precioOriginal < 0) {
        return { error: 'El precio original no es válido.' };
    }
    var precioMayoreo = '';
    if (d.precioBazar !== '' && d.precioBazar != null) {
        precioMayoreo = Number(d.precioBazar);
        if (!isFinite(precioMayoreo) || precioMayoreo < 0) return { error: 'El precio de mayoreo no es válido.' };
    }

    var descripcion = textoSeguro_(d.descripcion, 500);

    // Etiqueta principal (G): principales + FORMAS (d.formas), sin comas raras ni duplicados.
    // (Fer sigue mandando todo junto en d.etiquetas; la página de Polo manda las formas aparte.)
    var etiquetas = [];
    (Array.isArray(d.etiquetas) ? d.etiquetas : []).concat(Array.isArray(d.formas) ? d.formas : []).forEach(function (t) {
        t = String(t).replace(/[|,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().substring(0, 40);
        if (t && etiquetas.indexOf(t) === -1) etiquetas.push(t);
    });
    if (!etiquetas.length) etiquetas.push('arreglo'); // valor que Polo usa por defecto

    // Etiquetas de evento (M): slugs tipo "dia-de-muertos" (minúsculas, sin acentos, guiones), sin duplicados
    var eventos = [];
    (Array.isArray(d.eventos) ? d.eventos : []).forEach(function (t) {
        t = String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').substring(0, 40);
        if (t && eventos.indexOf(t) === -1) eventos.push(t);
    });
    if (eventos.length > MAX_EVENTOS) return { error: 'Máximo ' + MAX_EVENTOS + ' etiquetas de evento por producto.' };

    // Sub etiquetas (H): opcional, separadas por coma, sin duplicados
    var subEtiquetas = [];
    (Array.isArray(d.subEtiquetas) ? d.subEtiquetas : []).forEach(function (t) {
        t = String(t).replace(/[|,]/g, ' ').trim().toLowerCase();
        if (t && subEtiquetas.indexOf(t) === -1) subEtiquetas.push(t);
    });

    var alto = medidaSegura_(d.alto), ancho = medidaSegura_(d.ancho);
    if (alto === null || ancho === null) return { error: 'Las medidas no son válidas.' };
    var medidas = (alto === '' && ancho === '') ? '' : alto + '/' + ancho;
    // Al editar: si la hoja tenía medidas escritas como texto libre (ej. "12 cm") y no se llenó alto/ancho, se conservan
    if (medidas === '' && d.medidasTexto != null && String(d.medidasTexto).trim() !== '') medidas = textoSeguro_(d.medidasTexto, 40);

    var video = '';
    if (d.video != null && String(d.video).trim() !== '') {
        var mv = String(d.video).match(/^https:\/\/www\.youtube\.com\/embed\/[\w-]{11}$/);
        if (!mv) return { error: 'El video debe ser un link embed de YouTube.' };
        video = String(d.video).trim();
    }

    var existencia = '';
    if (d.existencia !== '' && d.existencia != null) {
        var ex = Number(d.existencia);
        if (!isFinite(ex) || ex < 0 || ex > 100000) return { error: 'La existencia no es válida.' };
        existencia = Math.floor(ex);
    }
    var enOferta   = (d.enOferta === true || d.enOferta === 'si') ? 'si' : 'no';
    var masVendido = (d.masVendido === true || d.masVendido === 'si') ? 'si' : 'no';

    return {
        nombre: nombre, precioOriginal: precioOriginal, precioMayoreo: precioMayoreo, descripcion: descripcion,
        etiquetas: etiquetas, eventos: eventos, subEtiquetas: subEtiquetas, medidas: medidas, video: video,
        existencia: existencia, enOferta: enOferta, masVendido: masVendido
    };
}

function agregarProducto_(d, lock) {
    var c = validarCamposProducto_(d);
    if (c.error) return respuesta_({ ok: false, error: c.error });
    var nombre = c.nombre, precioOriginal = c.precioOriginal, precioMayoreo = c.precioMayoreo, descripcion = c.descripcion;
    var etiquetas = c.etiquetas, eventos = c.eventos, subEtiquetas = c.subEtiquetas, medidas = c.medidas, video = c.video;
    var existencia = c.existencia, enOferta = c.enOferta, masVendido = c.masVendido;

    // Imágenes: la principal (fondo azul) viaja en base64; las extras ya vienen como links del imgbb de Polo
    // La principal puede llegar como archivo en base64 (se sube aquí) o como link de imgbb ya publicado
    var urlPrincipal = '';
    if (!d.imagenBase64) {
        urlPrincipal = String(d.imagenUrl || '').trim();
        if (!urlPrincipal) return respuesta_({ ok: false, error: 'Falta la imagen principal (fondo azul).' });
        if (!/^https:\/\/i\.ibb\.co\/[^\s,]+$/i.test(urlPrincipal)) return respuesta_({ ok: false, error: 'La imagen principal no es un link válido de imgbb.' });
    }
    var imagenes = [];
    var extras = Array.isArray(d.imagenesExtra) ? d.imagenesExtra : [];
    for (var k = 0; k < extras.length; k++) {
        var ue = String(extras[k]).trim();
        if (!/^https:\/\/i\.ibb\.co\/[^\s,]+$/i.test(ue)) return respuesta_({ ok: false, error: 'Una foto adicional no es un link válido de imgbb.' });
        imagenes.push(ue);
    }
    if (imagenes.length + 1 > MAX_IMAGENES) return respuesta_({ ok: false, error: 'Máximo ' + MAX_IMAGENES + ' imágenes por producto.' });
    imagenes.unshift(d.imagenBase64 ? subirImagenAImgbb_(d.imagenBase64, d.nombreArchivo) : urlPrincipal);

    // Escribir en la hoja (con candado para que dos guardados no se pisen)
    lock.waitLock(20000);
    var hoja = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(NOMBRE_HOJA);
    if (!hoja) return respuesta_({ ok: false, error: 'No se encontró la pestaña "' + NOMBRE_HOJA + '" en la hoja de Polo.' });

    var fila = ultimaFilaConNombre_(hoja) + 1;
    if (fila > hoja.getMaxRows()) hoja.insertRowsAfter(hoja.getMaxRows(), fila - hoja.getMaxRows());

    // Columna I como texto plano: si no, Sheets convierte "12/8" en una fecha
    hoja.getRange(fila, 9).setNumberFormat('@');
    // A producto | B precio | C mayoreo | D descripción | E imágenes | F video | G etiqueta principal |
    // H sub etiquetas (opcional) | I medidas | J existencia | K oferta | L más vendido | M evento
    hoja.getRange(fila, 1, 1, 13).setValues([[
        nombre, precioOriginal, precioMayoreo, descripcion, imagenes.join(', '), video,
        etiquetas.join(', '), subEtiquetas.join(', '), medidas, existencia, enOferta, masVendido,
        eventos.join(', ')
    ]]);
    SpreadsheetApp.flush();

    return respuesta_({ ok: true, fila: fila, url: imagenes[0] });
}

// ──────────── ELIMINAR PRODUCTO (solo administradores) ────────────
// Borra la fila indicada por su NÚMERO (los productos de abajo suben una fila).
// El producto se identifica solo por la fila, así que dos productos con el mismo nombre no causan problema.
// Solo se protege que la fila exista y tenga un producto (no se pueden borrar el encabezado ni filas vacías).
function eliminarProducto_(d, lock) {
    var fila = Math.floor(Number(d.fila));
    if (!isFinite(fila) || fila < 2) return respuesta_({ ok: false, error: 'La fila del producto no es válida.' });

    lock.waitLock(20000);
    var hoja = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(NOMBRE_HOJA);
    if (!hoja) return respuesta_({ ok: false, error: 'No se encontró la pestaña "' + NOMBRE_HOJA + '" en la hoja de Polo.' });
    if (fila > hoja.getLastRow()) return respuesta_({ ok: false, error: 'La fila ' + fila + ' ya no existe en la hoja. Recarga la página.' });

    var nombreBorrado = String(hoja.getRange(fila, 1).getDisplayValue()).replace(/^'/, '').trim();
    if (!nombreBorrado) return respuesta_({ ok: false, error: 'La fila ' + fila + ' está vacía en la hoja. Recarga la página.' });
    // Si la página mandó el nombre que cree estar borrando, debe coincidir con el de la fila (evita borrar otro producto)
    if (d.nombreOriginal != null && String(d.nombreOriginal).replace(/^'/, '').trim() !== nombreBorrado) {
        return respuesta_({ ok: false, error: 'La fila ' + fila + ' ahora es «' + nombreBorrado + '», no «' + String(d.nombreOriginal).trim() + '». La hoja cambió: recarga la página y vuelve a intentar. No se borró nada.' });
    }

    hoja.deleteRow(fila);
    SpreadsheetApp.flush();
    // Se devuelve el nombre de lo que realmente se borró, para que la página lo muestre
    return respuesta_({ ok: true, accion: 'eliminar', fila: fila, nombre: nombreBorrado });
}

// ──────────── EDITAR PRODUCTO (solo administradores) ────────────
// Reescribe las columnas A–L de la fila indicada. La página manda la lista FINAL de imágenes (links ya
// subidos a imgbb, la primera es la principal), así que aquí no se sube nada.
function editarProducto_(d, lock) {
    var c = validarCamposProducto_(d);
    if (c.error) return respuesta_({ ok: false, error: c.error });

    var imagenes = [];
    var lista = Array.isArray(d.imagenes) ? d.imagenes : [];
    for (var k = 0; k < lista.length; k++) {
        var u = String(lista[k]).trim();
        if (!/^https:\/\/[^\s,]+$/i.test(u)) return respuesta_({ ok: false, error: 'Una de las imágenes no es un link válido (https).' });
        imagenes.push(u);
    }
    if (!imagenes.length) return respuesta_({ ok: false, error: 'El producto necesita al menos una imagen.' });
    if (imagenes.length > MAX_IMAGENES) return respuesta_({ ok: false, error: 'Máximo ' + MAX_IMAGENES + ' imágenes por producto.' });

    lock.waitLock(20000);
    var hoja = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(NOMBRE_HOJA);
    if (!hoja) return respuesta_({ ok: false, error: 'No se encontró la pestaña "' + NOMBRE_HOJA + '" en la hoja de Polo.' });
    var fila = Math.floor(Number(d.fila));
    var err = verificarFila_(hoja, fila, d.nombreOriginal);
    if (err) return respuesta_({ ok: false, error: err });

    hoja.getRange(fila, 9).setNumberFormat('@'); // columna I como texto (si no, "12/8" se vuelve fecha)
    hoja.getRange(fila, 1, 1, 13).setValues([[
        c.nombre, c.precioOriginal, c.precioMayoreo, c.descripcion, imagenes.join(', '), c.video,
        c.etiquetas.join(', '), c.subEtiquetas.join(', '), c.medidas, c.existencia, c.enOferta, c.masVendido,
        c.eventos.join(', ')
    ]]);
    SpreadsheetApp.flush();
    return respuesta_({ ok: true, accion: 'editar', fila: fila, nombre: c.nombre, url: imagenes[0] });
}

// ──────────── MOVER PRODUCTO (solo administradores) ────────────
// posicion: 'inicio' | 'final' | 'antes' (justo antes de la fila filaDestino, que debe seguir siendo nombreDestino).
// Mueve la fila completa (con su formato); las demás se recorren.
function moverProducto_(d, lock) {
    // Sin "posicion": modo número de fila (mover / intercambiar), igual que en Yesos Fer
    if (d.posicion == null || String(d.posicion) === '') return intercambiarProducto_(d, lock);
    var posicion = String(d.posicion || '');
    if (['inicio', 'final', 'antes'].indexOf(posicion) === -1) return respuesta_({ ok: false, error: 'La posición indicada no es válida.' });

    lock.waitLock(20000);
    var hoja = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(NOMBRE_HOJA);
    if (!hoja) return respuesta_({ ok: false, error: 'No se encontró la pestaña "' + NOMBRE_HOJA + '" en la hoja de Polo.' });
    var fila = Math.floor(Number(d.fila));
    var err = verificarFila_(hoja, fila, d.nombreOriginal);
    if (err) return respuesta_({ ok: false, error: err });

    var ultima = ultimaFilaConNombre_(hoja);
    var destino; // índice de fila ANTES de la cual se coloca (coordenadas actuales, antes de mover)
    if (posicion === 'inicio') {
        destino = 2;
    } else if (posicion === 'final') {
        destino = ultima + 1;
    } else {
        var filaDestino = Math.floor(Number(d.filaDestino));
        var errD = verificarFila_(hoja, filaDestino, d.nombreDestino);
        if (errD) return respuesta_({ ok: false, error: 'Producto de destino: ' + errD });
        destino = filaDestino;
    }
    // Si ya está justo donde se pide, no hay nada que hacer
    if (destino === fila || destino === fila + 1) return respuesta_({ ok: false, error: 'El producto ya está en esa posición.' });

    if (destino > hoja.getMaxRows()) hoja.insertRowsAfter(hoja.getMaxRows(), destino - hoja.getMaxRows());
    hoja.moveRows(hoja.getRange(fila, 1, 1, 1), destino);
    SpreadsheetApp.flush();

    var nuevaFila = destino > fila ? destino - 1 : destino;
    return respuesta_({ ok: true, accion: 'mover', desde: fila, fila: nuevaFila, nombre: String(hoja.getRange(nuevaFila, 1).getDisplayValue()).replace(/^'/, '').trim() });
}

// ──────────── MOVER / INTERCAMBIAR POR NÚMERO DE FILA (solo administradores) ────────────
// Igual que en Yesos Fer. "fila" = fila actual del producto; "filaDestino" = fila a la que se quiere llevar.
//  • destino ocupado → los dos productos se INTERCAMBIAN
//  • destino libre   → el producto se mueve y su fila anterior queda vacía
//  • destino vacío   → el producto pasa a la última fila disponible
// "nombreOriginal" es obligatorio (se comprueba que la fila siga siendo ese producto). Si la página manda
// "nombreDestino", también se comprueba lo que hay en el destino ('' = esperaba que estuviera libre).
function intercambiarProducto_(d, lock) {
    var filaOrigen = Math.floor(Number(d.fila));
    if (!isFinite(filaOrigen) || filaOrigen < 2) return respuesta_({ ok: false, error: 'La fila del producto no es válida.' });
    if (filaOrigen >= FILA_RESERVADA_INICIO && filaOrigen <= FILA_RESERVADA_FIN) {
        return respuesta_({ ok: false, error: 'Ese producto está en una fila reservada y no se puede mover desde aquí.' });
    }

    var aUltima = (d.filaDestino === '' || d.filaDestino == null);
    var filaDestino = 0;
    if (!aUltima) {
        filaDestino = Math.floor(Number(d.filaDestino));
        var err = validarFilaDestino_(filaDestino);
        if (err) return respuesta_({ ok: false, error: err });
        if (filaDestino === filaOrigen) return respuesta_({ ok: false, error: 'El producto ya está en la fila ' + filaOrigen + '.' });
    }

    lock.waitLock(20000);
    var hoja = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(NOMBRE_HOJA);
    if (!hoja) return respuesta_({ ok: false, error: 'No se encontró la pestaña "' + NOMBRE_HOJA + '" en la hoja de Polo.' });

    // Protección: la fila debe seguir siendo el mismo producto que el admin abrió
    var errO = verificarFila_(hoja, filaOrigen, d.nombreOriginal);
    if (errO) return respuesta_({ ok: false, error: errO });

    if (aUltima) {
        if (filaOrigen === ultimaFilaConNombre_(hoja)) return respuesta_({ ok: false, error: 'Ese producto ya es el último de la hoja.' });
        filaDestino = proximaFilaLibre_(hoja);
    }

    var maxFilas = hoja.getMaxRows();
    if (filaDestino > maxFilas) hoja.insertRowsAfter(maxFilas, filaDestino - maxFilas);

    var rOrigen  = hoja.getRange(filaOrigen, 1, 1, 13);
    var rDestino = hoja.getRange(filaDestino, 1, 1, 13);
    var vOrigen  = rOrigen.getValues()[0];
    var vDestino = rDestino.getValues()[0];
    var nombreDestino = String(hoja.getRange(filaDestino, 1).getDisplayValue()).replace(/^'/, '').trim();
    var destinoOcupado = nombreDestino !== '';

    // Si la página dijo qué esperaba encontrar en el destino y la hoja cambió, no se toca nada
    if (!aUltima && d.nombreDestino != null) {
        var esperado = String(d.nombreDestino).replace(/^'/, '').trim();
        if (esperado !== nombreDestino) {
            return respuesta_({ ok: false, error: 'La fila ' + filaDestino + ' cambió (ahora ' + (destinoOcupado ? 'es «' + nombreDestino + '»' : 'está libre') + '). Recarga la página e inténtalo de nuevo. No se modificó nada.' });
        }
    }

    // Columna I como texto plano en ambas filas (si no, "12/8" se vuelve fecha)
    hoja.getRange(filaOrigen, 9).setNumberFormat('@');
    hoja.getRange(filaDestino, 9).setNumberFormat('@');

    var nombreMovido = String(hoja.getRange(filaOrigen, 1).getDisplayValue()).replace(/^'/, '').trim();
    if (destinoOcupado) {
        rOrigen.setValues([protegerFormulas_(vDestino)]);
        rDestino.setValues([protegerFormulas_(vOrigen)]);
    } else {
        rDestino.setValues([protegerFormulas_(vOrigen)]);
        rOrigen.clearContent();
    }
    SpreadsheetApp.flush();

    return respuesta_({
        ok: true, accion: 'mover',
        filaOrigen: filaOrigen, filaDestino: filaDestino, fila: filaDestino, nombre: nombreMovido,
        intercambio: destinoOcupado, nombreDestino: destinoOcupado ? nombreDestino : ''
    });
}

// Devuelve un texto de error si la fila no se puede usar como destino, o '' si está bien.
function validarFilaDestino_(n) {
    if (!isFinite(n)) return 'La fila elegida no es válida.';
    if (n < 2) return 'La fila 1 está reservada para los encabezados. Elige la fila 2 o una mayor.';
    if (n > FILA_MAX) return 'La fila máxima permitida es la ' + FILA_MAX + '.';
    if (n >= FILA_RESERVADA_INICIO && n <= FILA_RESERVADA_FIN) {
        return 'Las filas ' + FILA_RESERVADA_INICIO + ' a ' + FILA_RESERVADA_FIN + ' están reservadas (productos de Etiquetas y Velas). Elige otra.';
    }
    return '';
}

// Primera fila libre después del último producto, saltándose las filas reservadas.
function proximaFilaLibre_(hoja) {
    var f = ultimaFilaConNombre_(hoja) + 1;
    if (f >= FILA_RESERVADA_INICIO && f <= FILA_RESERVADA_FIN) f = FILA_RESERVADA_FIN + 1;
    return f;
}

// Evita que un texto que empiece con = + - @ se convierta en fórmula al reescribirlo.
function protegerFormulas_(valores) {
    return valores.map(function (v) {
        return (typeof v === 'string' && /^[=+\-@]/.test(v)) ? "'" + v : v;
    });
}

// Comprueba que la fila exista, tenga un producto y que su nombre sea el que la página esperaba.
// Devuelve '' si todo bien, o el mensaje de error.
function verificarFila_(hoja, fila, nombreEsperado) {
    if (!isFinite(fila) || fila < 2) return 'La fila del producto no es válida.';
    if (nombreEsperado == null || String(nombreEsperado).trim() === '') return 'Falta el nombre del producto para verificar la fila.';
    if (fila > hoja.getLastRow()) return 'La fila ' + fila + ' ya no existe en la hoja. Recarga la página.';
    var actual = String(hoja.getRange(fila, 1).getDisplayValue()).replace(/^'/, '').trim();
    if (!actual) return 'La fila ' + fila + ' está vacía en la hoja. Recarga la página.';
    if (actual !== String(nombreEsperado).replace(/^'/, '').trim()) {
        return 'La fila ' + fila + ' ahora es «' + actual + '», no «' + String(nombreEsperado).trim() + '». La hoja cambió: recarga la página y vuelve a intentar. No se modificó nada.';
    }
    return '';
}

// ──────────── AUTORIZAR ADMINISTRADOR ────────────
// Verifica el idToken con Google, que el correo esté verificado y que sea de CORREOS_ADMIN.
function autorizarAdmin_(d) {
    if (!d.idToken) return { ok: false, error: 'Falta la sesión (idToken).' };
    var v = verificarTokenFirebase_(d.idToken);
    if (!v.ok) return { ok: false, error: v.error };
    if (!v.emailVerified) return { ok: false, error: 'Tu correo no está verificado.' };
    if (CORREOS_ADMIN.indexOf(v.email) === -1) return { ok: false, error: 'No tienes permiso de administrador.' };
    return { ok: true, email: v.email };
}

// ──────────── VERIFICAR TOKEN DE FIREBASE (proyecto de Polo) ────────────
function verificarTokenFirebase_(idToken) {
    var clave = PropertiesService.getScriptProperties().getProperty('FIREBASE_KEY') || FIREBASE_API_KEY;
    var r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + encodeURIComponent(clave), {
        method: 'post',
        contentType: 'application/json',
        // Apps Script no manda "Referer"; si la API key tiene restricción por sitios web, Google la rechaza.
        // Con este encabezado la petición cuenta como hecha desde la página de Polo.
        headers: { 'Referer': 'https://elpologr.github.io/' },
        payload: JSON.stringify({ idToken: idToken }),
        muteHttpExceptions: true
    });
    var cuerpo;
    try { cuerpo = JSON.parse(r.getContentText()); } catch (e) { return { ok: false, error: 'Respuesta inválida de Firebase.' }; }
    if (r.getResponseCode() !== 200 || !cuerpo.users || !cuerpo.users.length) {
        // Se incluye el motivo real que da Google (ej. "API_KEY_HTTP_REFERRER_BLOCKED") para poder diagnosticar.
        var motivo = (cuerpo && cuerpo.error && cuerpo.error.message) ? ' [' + cuerpo.error.message + ']' : '';
        return { ok: false, error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' + motivo };
    }
    var u = cuerpo.users[0];
    return { ok: true, email: (u.email || '').toLowerCase(), emailVerified: !!u.emailVerified };
}

// ──────────── ETIQUETAS NUEVAS (solo administradores) ────────────
// Las etiquetas que el administrador crea desde el formulario ("Agregar etiqueta nueva") se guardan aquí,
// en las propiedades del script, para que estén disponibles siempre y en cualquier dispositivo.
// Formato: { principal: [{ v: valor, e: emoji, t: texto }], evento: [...], forma: [...] }
// "valor" es lo que se escribe en la hoja (G para principal y forma, M para evento), con las mismas reglas
// de limpieza que validarCamposProducto_.
var PROP_ETIQUETAS_NUEVAS = 'ETIQUETAS_PERSONALIZADAS';
var MAX_ETIQUETAS_NUEVAS  = 30;   // por zona
var TIPOS_ETIQUETA_NUEVA  = ['principal', 'evento', 'forma'];

function leerEtiquetasPersonalizadas_() {
    var base = { principal: [], evento: [], forma: [] };
    try {
        var txt = PropertiesService.getScriptProperties().getProperty(PROP_ETIQUETAS_NUEVAS);
        if (!txt) return base;
        var o = JSON.parse(txt);
        TIPOS_ETIQUETA_NUEVA.forEach(function (t) { if (Array.isArray(o[t])) base[t] = o[t]; });
    } catch (e) { /* si está dañado se empieza de cero */ }
    return base;
}

function valorEtiquetaNueva_(tipo, texto) {
    var t = String(texto == null ? '' : texto);
    if (tipo === 'evento') {
        return t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '').substring(0, 40);
    }
    return t.replace(/[|,]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().substring(0, 40);
}

// Solo se aceptan emojis (nada de letras, números ni símbolos de código); si no sirve, uno genérico.
function emojiEtiquetaSeguro_(emoji, tipo) {
    var base = { principal: '🏷️', evento: '🎉', forma: '🔷' }[tipo];
    var e = Array.from(String(emoji == null ? '' : emoji).trim()).slice(0, 4).join('');
    if (!e || /[A-Za-z0-9<>&"'\\]/.test(e)) return base;
    return e;
}

function agregarEtiquetaPersonalizada_(d, lock) {
    var tipo = String(d.tipo || '');
    if (TIPOS_ETIQUETA_NUEVA.indexOf(tipo) === -1) return respuesta_({ ok: false, error: 'Tipo de etiqueta no válido.' });
    var texto = String(d.texto == null ? '' : d.texto).replace(/\s+/g, ' ').trim().substring(0, 28);
    var valor = valorEtiquetaNueva_(tipo, texto);
    if (!texto || !valor) return respuesta_({ ok: false, error: 'Escribe un nombre con letras o números.' });
    var emoji = emojiEtiquetaSeguro_(d.emoji, tipo);

    lock.waitLock(20000);
    var lista = leerEtiquetasPersonalizadas_();
    var existe = lista[tipo].some(function (it) { return it.v === valor; });
    if (existe) return respuesta_({ ok: true, existente: true, valor: valor, etiquetas: lista });
    if (lista[tipo].length >= MAX_ETIQUETAS_NUEVAS) {
        return respuesta_({ ok: false, error: 'Ya hay ' + MAX_ETIQUETAS_NUEVAS + ' etiquetas nuevas en esta zona (el máximo).' });
    }
    lista[tipo].push({ v: valor, e: emoji, t: texto });
    PropertiesService.getScriptProperties().setProperty(PROP_ETIQUETAS_NUEVAS, JSON.stringify(lista));
    return respuesta_({ ok: true, valor: valor, etiquetas: lista });
}

// ──────────── AUXILIARES ────────────

// Recorta y evita que un texto que empiece con = + - @ se interprete como fórmula.
function textoSeguro_(valor, max) {
    var t = String(valor == null ? '' : valor).trim().substring(0, max);
    return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function medidaSegura_(valor) {
    if (valor === '' || valor == null) return '';
    var n = Number(valor);
    if (!isFinite(n) || n < 0 || n > 1000) return null;
    return String(Math.round(n * 100) / 100);
}

// Última fila con algo en la columna A (ignora filas vacías con formato al final de la hoja).
function ultimaFilaConNombre_(hoja) {
    var col = hoja.getRange(1, 1, hoja.getMaxRows(), 1).getValues();
    for (var i = col.length - 1; i >= 0; i--) {
        if (String(col[i][0]).trim() !== '') return i + 1;
    }
    return 1;
}

// ──────────── SUBIR IMAGEN A IMGBB (cuenta de POLO) ────────────

function subirImagenAImgbb_(dataUrlBase64, nombreArchivo) {
    var props = PropertiesService.getScriptProperties();
    var apiKey = props.getProperty('IMGBB_KEY') || props.getProperty('IMGBB_API_KEY');
    if (!apiKey) throw new Error('Falta IMGBB_KEY en las propiedades del script de Polo.');

    // dataUrlBase64 llega como "data:image/webp;base64,AAAA..."
    var partes = String(dataUrlBase64).split(',');
    var datosPuros = partes[1] || partes[0];

    var r = UrlFetchApp.fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
        method: 'post',
        payload: { image: datosPuros, name: String(nombreArchivo || 'producto').replace(/\.[a-z0-9]+$/i, '') },
        muteHttpExceptions: true
    });

    var cuerpo;
    try { cuerpo = JSON.parse(r.getContentText()); } catch (e) { throw new Error('Respuesta inválida de imgbb.'); }
    if (r.getResponseCode() !== 200 || !cuerpo.success || !cuerpo.data || !cuerpo.data.url) {
        throw new Error('imgbb no aceptó la imagen' + (cuerpo && cuerpo.error && cuerpo.error.message ? ': ' + cuerpo.error.message : '.'));
    }
    return cuerpo.data.url; // link directo https://i.ibb.co/...
}
