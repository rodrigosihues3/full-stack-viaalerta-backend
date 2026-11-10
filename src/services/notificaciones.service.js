import { pool } from '../config/db.js';
import { notificarUsuario } from './socket.service.js';

const crearError = (mensaje, statusCode = 400) => {
    const error = new Error(mensaje);
    error.statusCode = statusCode;
    return error;
};

const ETIQUETAS_ESTADO = {
    REGISTRADO: 'Registrado',
    EVALUACION: 'En Evaluación',
    REPARACION: 'En Reparación',
    RESUELTO: 'Resuelto',
    DESESTIMADO: 'Desestimado'
};

let tieneColumnaIncidenteId = null;

const verificarColumnaIncidenteId = async (dbClient = pool) => {
    if (tieneColumnaIncidenteId !== null) return tieneColumnaIncidenteId;
    try {
        const { rows } = await dbClient.query(
            `SELECT 1
             FROM information_schema.columns
             WHERE table_schema = 'public'
               AND table_name = 'notificaciones_usuario'
               AND column_name = 'incidente_id'
             LIMIT 1`
        );
        tieneColumnaIncidenteId = rows.length > 0;
    } catch {
        tieneColumnaIncidenteId = false;
    }
    return tieneColumnaIncidenteId;
};

/**
 * Construye el título y mensaje descriptivo según el estado del reporte.
 */
export const construirContenidoNotificacion = ({
    ticketFolio,
    categoriaNombre = 'incidente vial',
    entidadNombre = 'la entidad competente',
    estadoNuevo,
    notaObservacion = null,
    motivoDesestimacion = null
}) => {
    const estado = (estadoNuevo || 'REGISTRADO').toUpperCase();
    const etiqueta = ETIQUETAS_ESTADO[estado] || estado;
    const folio = ticketFolio || 'Reporte';

    let titulo = `Actualización de tu reporte · ${folio}`;
    let mensaje = `Tu reporte ${folio} sobre "${categoriaNombre}" ha cambiado al estado "${etiqueta}".`;

    switch (estado) {
        case 'REGISTRADO':
            titulo = `Reporte recibido · ${folio}`;
            mensaje = `Tu reporte ${folio} sobre "${categoriaNombre}" fue recibido correctamente y derivado a ${entidadNombre} con estado "${etiqueta}".`;
            break;
        case 'EVALUACION':
            titulo = `Reporte en evaluación · ${folio}`;
            mensaje = `Tu reporte ${folio} sobre "${categoriaNombre}" ha cambiado al estado "${etiqueta}". El equipo técnico de ${entidadNombre} se encuentra evaluando la incidencia.`;
            if (notaObservacion && notaObservacion !== 'Reporte ciudadano inicial') {
                mensaje += ` Observación: ${notaObservacion}.`;
            }
            break;
        case 'REPARACION':
            titulo = `Actualización de tu reporte · ${folio}`;
            mensaje = `Tu reporte ${folio} sobre "${categoriaNombre}" ha cambiado al estado "${etiqueta}". El equipo correspondiente de ${entidadNombre} ya se encuentra trabajando en su atención.`;
            if (notaObservacion && notaObservacion !== 'Reporte ciudadano inicial') {
                mensaje += ` Detalle: ${notaObservacion}.`;
            }
            break;
        case 'RESUELTO':
            titulo = `¡Reporte solucionado! · ${folio}`;
            mensaje = `Tu reporte ${folio} sobre "${categoriaNombre}" ha cambiado al estado "${etiqueta}". La atención vial fue finalizada satisfactoriamente por ${entidadNombre}.`;
            if (notaObservacion && notaObservacion !== 'Reporte ciudadano inicial') {
                mensaje += ` Nota de cierre: ${notaObservacion}.`;
            }
            break;
        case 'DESESTIMADO': {
            titulo = `Reporte observado · ${folio}`;
            const motivo = motivoDesestimacion || notaObservacion || 'Observado durante la verificación técnica';
            mensaje = `Tu reporte ${folio} sobre "${categoriaNombre}" ha pasado al estado "${etiqueta}". Motivo informado: ${motivo}.`;
            break;
        }
        default:
            break;
    }

    return {
        titulo: titulo.slice(0, 120),
        mensaje,
        tipo: estado
    };
};

/**
 * Formatea una fila de notificación de base de datos al contrato unificado REST/WebSocket.
 */
export const formatearNotificacion = (row) => {
    if (!row) return null;
    const ticketExtraido =
        row.ticket_folio ||
        (row.titulo && row.titulo.match(/(TKT-[0-9]{4}-[0-9]+)/)?.[1]) ||
        (row.mensaje && row.mensaje.match(/(TKT-[0-9]{4}-[0-9]+)/)?.[1]) ||
        null;

    return {
        id: row.id,
        usuario_id: row.usuario_id,
        user_id: row.usuario_id,
        incidente_id: row.incidente_id || null,
        report_id: row.incidente_id || null,
        ticket_folio: ticketExtraido,
        categoria_nombre: row.categoria_nombre || null,
        distrito: row.distrito || null,
        direccion_referencial: row.direccion_referencial || null,
        estado_actual_reporte: row.estado_actual_reporte || row.tipo || null,
        titulo: row.titulo,
        title: row.titulo,
        mensaje: row.mensaje,
        message: row.mensaje,
        tipo: row.tipo || 'INFO',
        type: row.tipo || 'INFO',
        leido: Boolean(row.leido),
        is_read: Boolean(row.leido),
        creado_en: row.creado_en,
        created_at: row.creado_en
    };
};

/**
 * Crea una notificación persistente en Supabase cuando se registra un reporte
 * o cuando cambia realmente su estado, evitando duplicados.
 */
export const crearNotificacionIncidente = async ({
    usuarioId,
    incidenteId,
    ticketFolio,
    estadoNuevo,
    notaObservacion = null,
    motivoDesestimacion = null,
    emitirSocket = true
}) => {
    if (!usuarioId || !ticketFolio || !estadoNuevo) return null;

    const estadoNormalizado = String(estadoNuevo).toUpperCase();

    // 1. Verificar que la última notificación de este mismo reporte no sea del mismo estado (evitar duplicados)
    const { rows: previas } = await pool.query(
        `SELECT id, tipo
         FROM notificaciones_usuario
         WHERE usuario_id = $1
           AND (titulo LIKE '%' || $2 || '%' OR mensaje LIKE '%' || $2 || '%')
         ORDER BY creado_en DESC
         LIMIT 1`,
        [usuarioId, ticketFolio]
    );

    if (previas.length > 0 && String(previas[0].tipo).toUpperCase() === estadoNormalizado) {
        return null;
    }

    // 2. Obtener metadatos enriquecidos del incidente (categoría y entidad)
    let categoriaNombre = 'incidente vial';
    let entidadNombre = 'la entidad asignada';
    let distrito = null;
    let direccionReferencial = null;
    let idIncidenteResuelto = incidenteId || null;

    try {
        const { rows: detalles } = await pool.query(
            `SELECT i.id, i.ticket_folio, i.distrito, i.direccion_referencial,
                    ci.nombre AS categoria_nombre,
                    ep.sigla AS entidad_sigla,
                    ep.nombre_oficial AS entidad_nombre
             FROM incidentes i
             LEFT JOIN categorias_incidentes ci ON i.categoria_id = ci.id
             LEFT JOIN entidades_publicas ep ON i.entidad_asignada_id = ep.id
             WHERE i.ticket_folio = $1 OR i.id = $2
             LIMIT 1`,
            [ticketFolio, incidenteId || null]
        );
        if (detalles.length > 0) {
            idIncidenteResuelto = detalles[0].id;
            categoriaNombre = detalles[0].categoria_nombre || categoriaNombre;
            entidadNombre = detalles[0].entidad_sigla || detalles[0].entidad_nombre || entidadNombre;
            distrito = detalles[0].distrito;
            direccionReferencial = detalles[0].direccion_referencial;
        }
    } catch {
        // Continuar con valores por defecto si falla la consulta auxiliar
    }

    const { titulo, mensaje, tipo } = construirContenidoNotificacion({
        ticketFolio,
        categoriaNombre,
        entidadNombre,
        estadoNuevo: estadoNormalizado,
        notaObservacion,
        motivoDesestimacion
    });

    const usaColumnaIncidente = await verificarColumnaIncidenteId();

    let filaInsertada;
    if (usaColumnaIncidente) {
        const { rows } = await pool.query(
            `INSERT INTO notificaciones_usuario (usuario_id, incidente_id, titulo, mensaje, tipo, leido)
             VALUES ($1, $2, $3, $4, $5, false)
             RETURNING *`,
            [usuarioId, idIncidenteResuelto, titulo, mensaje, tipo]
        );
        filaInsertada = rows[0];
    } else {
        const { rows } = await pool.query(
            `INSERT INTO notificaciones_usuario (usuario_id, titulo, mensaje, tipo, leido)
             VALUES ($1, $2, $3, $4, false)
             RETURNING *`,
            [usuarioId, titulo, mensaje, tipo]
        );
        filaInsertada = rows[0];
    }

    const notificacionFormateada = formatearNotificacion({
        ...filaInsertada,
        incidente_id: idIncidenteResuelto,
        ticket_folio: ticketFolio,
        categoria_nombre: categoriaNombre,
        distrito,
        direccion_referencial: direccionReferencial,
        estado_actual_reporte: estadoNormalizado
    });

    if (emitirSocket && notificacionFormateada) {
        notificarUsuario(usuarioId, notificacionFormateada);
    }

    return notificacionFormateada;
};

/**
 * Sincroniza por única vez el historial previo de reportes de un ciudadano
 * si aún no cuenta con notificaciones generadas en `notificaciones_usuario`.
 */
const sincronizarHistorialPrevioSiVacio = async (usuarioId) => {
    const { rows: conteo } = await pool.query(
        `SELECT COUNT(*)::int AS total FROM notificaciones_usuario WHERE usuario_id = $1`,
        [usuarioId]
    );

    if ((conteo[0]?.total || 0) > 0) {
        return;
    }

    const { rows: historial } = await pool.query(
        `SELECT 
            h.id AS historial_id,
            h.incidente_id,
            h.estado_anterior,
            h.estado_nuevo,
            h.nota_observacion,
            h.creado_en,
            i.ticket_folio,
            i.motivo_desestimacion,
            ci.nombre AS categoria_nombre,
            ep.sigla AS entidad_sigla
         FROM historial_estados_incidente h
         INNER JOIN incidentes i ON h.incidente_id = i.id
         LEFT JOIN categorias_incidentes ci ON i.categoria_id = ci.id
         LEFT JOIN entidades_publicas ep ON i.entidad_asignada_id = ep.id
         WHERE i.usuario_creador_id = $1
           AND (h.estado_anterior IS NULL OR h.estado_anterior <> h.estado_nuevo)
         ORDER BY h.creado_en ASC
         LIMIT 30`,
        [usuarioId]
    );

    if (historial.length === 0) return;

    const usaColumnaIncidente = await verificarColumnaIncidenteId();
    const ultimoEstadoPorTicket = new Map();

    for (const item of historial) {
        const estadoPrevio = ultimoEstadoPorTicket.get(item.ticket_folio);
        if (estadoPrevio === item.estado_nuevo) continue;
        ultimoEstadoPorTicket.set(item.ticket_folio, item.estado_nuevo);

        const { titulo, mensaje, tipo } = construirContenidoNotificacion({
            ticketFolio: item.ticket_folio,
            categoriaNombre: item.categoria_nombre || 'incidente vial',
            entidadNombre: item.entidad_sigla || 'la entidad asignada',
            estadoNuevo: item.estado_nuevo,
            notaObservacion: item.nota_observacion,
            motivoDesestimacion: item.motivo_desestimacion
        });

        if (usaColumnaIncidente) {
            await pool.query(
                `INSERT INTO notificaciones_usuario (usuario_id, incidente_id, titulo, mensaje, tipo, leido, creado_en)
                 VALUES ($1, $2, $3, $4, $5, false, $6)`,
                [usuarioId, item.incidente_id, titulo, mensaje, tipo, item.creado_en]
            );
        } else {
            await pool.query(
                `INSERT INTO notificaciones_usuario (usuario_id, titulo, mensaje, tipo, leido, creado_en)
                 VALUES ($1, $2, $3, $4, false, $5)`,
                [usuarioId, titulo, mensaje, tipo, item.creado_en]
            );
        }
    }
};

/**
 * Lista todas las notificaciones del usuario autenticado, asociando cada una
 * con su incidente correspondiente en Supabase.
 */
export const listarNotificacionesUsuario = async (usuarioId) => {
    await sincronizarHistorialPrevioSiVacio(usuarioId);

    const { rows } = await pool.query(
        `SELECT 
            n.id,
            n.usuario_id,
            n.titulo,
            n.mensaje,
            n.tipo,
            n.leido,
            n.creado_en,
            i.id AS incidente_id,
            i.ticket_folio,
            i.estado AS estado_actual_reporte,
            i.distrito,
            i.direccion_referencial,
            ci.nombre AS categoria_nombre
         FROM notificaciones_usuario n
         LEFT JOIN incidentes i
            ON i.ticket_folio = COALESCE(
                SUBSTRING(n.titulo FROM '(TKT-[0-9]{4}-[0-9]+)'),
                SUBSTRING(n.mensaje FROM '(TKT-[0-9]{4}-[0-9]+)')
            )
         LEFT JOIN categorias_incidentes ci
            ON i.categoria_id = ci.id
         WHERE n.usuario_id = $1
         ORDER BY n.creado_en DESC
         LIMIT 50`,
        [usuarioId]
    );

    const notificaciones = rows.map(formatearNotificacion);
    const noLeidasCount = notificaciones.filter((n) => !n.leido).length;

    return {
        notificaciones,
        noLeidasCount
    };
};

/**
 * Marca una notificación específica del usuario autenticado como leída.
 */
export const marcarComoLeida = async (notificacionId, usuarioId) => {
    const { rows } = await pool.query(
        `UPDATE notificaciones_usuario
         SET leido = true
         WHERE id = $1 AND usuario_id = $2
         RETURNING *`,
        [notificacionId, usuarioId]
    );

    if (rows.length === 0) {
        throw crearError('Notificación no encontrada o acceso no autorizado', 404);
    }

    return formatearNotificacion(rows[0]);
};

/**
 * Marca todas las notificaciones pendientes del usuario autenticado como leídas.
 */
export const marcarTodasComoLeidas = async (usuarioId) => {
    const { rowCount } = await pool.query(
        `UPDATE notificaciones_usuario
         SET leido = true
         WHERE usuario_id = $1 AND leido = false`,
        [usuarioId]
    );

    return {
        actualizadas: rowCount || 0,
        mensaje: 'Todas las notificaciones fueron marcadas como leídas'
    };
};
