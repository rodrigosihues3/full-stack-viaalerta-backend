import { pool } from '../config/db.js';
import {
    notificarIncidenteCreado,
    notificarCambioEstado,
    notificarConfirmacion
} from './socket.service.js';
import { crearNotificacionIncidente } from './notificaciones.service.js';

const ESTADOS_VALIDOS = ['REGISTRADO', 'EVALUACION', 'REPARACION', 'RESUELTO', 'DESESTIMADO'];
const SEVERIDADES_VALIDAS = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'];

const crearError = (mensaje, statusCode = 400) => {
    const error = new Error(mensaje);
    error.statusCode = statusCode;
    return error;
};

export const generarFolio = async (dbClient = pool) => {
    const anio = new Date().getFullYear();
    const patron = `TKT-${anio}-%`;

    const { rows } = await dbClient.query(
        `SELECT MAX(CAST(SUBSTRING(ticket_folio FROM '^TKT-[0-9]{4}-([0-9]+)$') AS INTEGER)) AS max_num
         FROM incidentes
         WHERE ticket_folio LIKE $1`,
        [patron]
    );

    const maxNum = rows[0]?.max_num;
    const siguiente = (maxNum !== null && maxNum !== undefined) ? Number(maxNum) + 1 : 1;
    return `TKT-${anio}-${String(siguiente).padStart(4, '0')}`;
};

export const listarIncidentes = async (usuario) => {
    let query = `
        SELECT 
            i.id,
            i.ticket_folio,
            i.entidad_asignada_id,
            ep.sigla AS entidad_sigla,
            ep.nombre_oficial AS entidad_nombre,
            i.usuario_creador_id,
            uc.nombres AS creador_nombres,
            uc.apellidos AS creador_apellidos,
            i.categoria_id,
            ci.nombre AS categoria_nombre,
            ci.icono_identificador AS categoria_icono,
            i.latitud,
            i.longitud,
            i.direccion_referencial,
            i.distrito,
            i.severidad,
            i.estado,
            i.observaciones_ciudadano,
            i.foto_url,
            i.ia_diagnostico,
            i.ia_confianza,
            i.ia_severidad,
            i.ia_recomendacion,
            i.motivo_desestimacion,
            i.operador_resolucion_id,
            uo.nombres AS operador_resolucion_nombres,
            uo.apellidos AS operador_resolucion_apellidos,
            i.confirmaciones_count,
            i.creado_en,
            i.actualizado_en
        FROM incidentes i
        INNER JOIN categorias_incidentes ci ON i.categoria_id = ci.id
        INNER JOIN entidades_publicas ep ON i.entidad_asignada_id = ep.id
        LEFT JOIN usuarios uc ON i.usuario_creador_id = uc.id
        LEFT JOIN usuarios uo ON i.operador_resolucion_id = uo.id
    `;

    const params = [];

    if (usuario.rol === 'OPERADOR_ENTIDAD') {
        if (!usuario.entidad_id) {
            throw crearError('El operador no tiene una entidad asignada', 403);
        }
        query += ` WHERE i.entidad_asignada_id = $1`;
        params.push(usuario.entidad_id);
    }

    query += ` ORDER BY i.creado_en DESC`;

    const { rows } = await pool.query(query, params);
    return rows;
};

/**
 * Consulta incidentes viales cercanos a las coordenadas del ciudadano
 * empleando la fórmula geodésica de Haversine en PostgreSQL.
 * Protege la privacidad omitiendo datos personales del creador del reporte.
 */
export const listarIncidentesCercanos = async ({ lat, lng, radio = 10, estado = null, categoriaId = null }, usuario) => {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
        throw crearError('Debe proporcionar coordenadas de latitud y longitud válidas', 400);
    }

    const radioKm = Math.min(Math.max(parseFloat(radio) || 10, 0.5), 100);
    const params = [latNum, lngNum, radioKm];
    const filtros = [];

    if (estado && estado !== 'TODOS' && ESTADOS_VALIDOS.includes(String(estado).toUpperCase())) {
        params.push(String(estado).toUpperCase());
        filtros.push(`sub.estado = $${params.length}`);
    } else if (!estado) {
        // Por defecto en el Monitor Vial priorizar incidentes no desestimados
        filtros.push(`sub.estado <> 'DESESTIMADO'`);
    }

    if (categoriaId && categoriaId !== 'TODAS') {
        params.push(String(categoriaId));
        filtros.push(`sub.categoria_id = $${params.length}`);
    }

    const whereAdicional = filtros.length > 0 ? `AND ${filtros.join(' AND ')}` : '';

    const query = `
        SELECT *
        FROM (
            SELECT
                i.id,
                i.ticket_folio,
                i.entidad_asignada_id,
                ep.sigla AS entidad_sigla,
                ep.nombre_oficial AS entidad_nombre,
                i.categoria_id,
                ci.nombre AS categoria_nombre,
                ci.icono_identificador AS categoria_icono,
                i.latitud,
                i.longitud,
                i.direccion_referencial,
                i.distrito,
                i.severidad,
                i.estado,
                i.observaciones_ciudadano,
                i.foto_url,
                i.confirmaciones_count,
                i.creado_en,
                i.actualizado_en,
                i.usuario_creador_id,
                ROUND(
                    CAST(
                        6371 * 2 * ASIN(
                            SQRT(
                                POWER(SIN(RADIANS(i.latitud - $1) / 2), 2) +
                                COS(RADIANS($1)) * COS(RADIANS(i.latitud)) *
                                POWER(SIN(RADIANS(i.longitud - $2) / 2), 2)
                            )
                        ) AS numeric
                    ),
                    2
                )::double precision AS distancia_km
            FROM incidentes i
            INNER JOIN categorias_incidentes ci ON i.categoria_id = ci.id
            INNER JOIN entidades_publicas ep ON i.entidad_asignada_id = ep.id
            WHERE i.latitud IS NOT NULL AND i.longitud IS NOT NULL
        ) sub
        WHERE sub.distancia_km <= $3
        ${whereAdicional}
        ORDER BY sub.distancia_km ASC, sub.creado_en DESC
        LIMIT 100
    `;

    const { rows } = await pool.query(query, params);

    // Sanitizar respuesta para no exponer identidad ni usuario_creador_id de terceros
    return rows.map(({ usuario_creador_id, ...publicData }) => ({
        ...publicData,
        es_mio: Boolean(usuario?.id && usuario_creador_id === usuario.id)
    }));
};

export const obtenerIncidentePorId = async (id, usuario) => {
    const query = `
        SELECT 
            i.id,
            i.ticket_folio,
            i.entidad_asignada_id,
            ep.sigla AS entidad_sigla,
            ep.nombre_oficial AS entidad_nombre,
            i.usuario_creador_id,
            uc.nombres AS creador_nombres,
            uc.apellidos AS creador_apellidos,
            i.categoria_id,
            ci.nombre AS categoria_nombre,
            ci.icono_identificador AS categoria_icono,
            i.latitud,
            i.longitud,
            i.direccion_referencial,
            i.distrito,
            i.severidad,
            i.estado,
            i.observaciones_ciudadano,
            i.foto_url,
            i.ia_diagnostico,
            i.ia_confianza,
            i.ia_severidad,
            i.ia_recomendacion,
            i.motivo_desestimacion,
            i.operador_resolucion_id,
            uo.nombres AS operador_resolucion_nombres,
            uo.apellidos AS operador_resolucion_apellidos,
            i.confirmaciones_count,
            i.creado_en,
            i.actualizado_en
        FROM incidentes i
        INNER JOIN categorias_incidentes ci ON i.categoria_id = ci.id
        INNER JOIN entidades_publicas ep ON i.entidad_asignada_id = ep.id
        LEFT JOIN usuarios uc ON i.usuario_creador_id = uc.id
        LEFT JOIN usuarios uo ON i.operador_resolucion_id = uo.id
        WHERE i.id = $1
    `;

    const { rows } = await pool.query(query, [id]);

    if (rows.length === 0) {
        throw crearError('Incidente no encontrado', 404);
    }

    const incidente = rows[0];

    // Validación de aislamiento multiorganizacional para OPERADOR_ENTIDAD
    if (usuario.rol === 'OPERADOR_ENTIDAD' && incidente.entidad_asignada_id !== usuario.entidad_id) {
        throw crearError('Acceso no autorizado a este incidente', 403);
    }

    // Obtener confirmaciones del incidente
    const { rows: confirmaciones } = await pool.query(
        `SELECT 
            c.id,
            c.incidente_id,
            c.usuario_id,
            u.nombres AS usuario_nombres,
            u.apellidos AS usuario_apellidos,
            c.foto_adicional_url,
            c.creado_en
         FROM confirmaciones_incidente c
         INNER JOIN usuarios u ON c.usuario_id = u.id
         WHERE c.incidente_id = $1
         ORDER BY c.creado_en ASC`,
        [id]
    );

    // Obtener historial de estados del incidente
    const { rows: historial } = await pool.query(
        `SELECT 
            h.id,
            h.incidente_id,
            h.operador_id,
            u.nombres AS operador_nombres,
            u.apellidos AS operador_apellidos,
            h.estado_anterior,
            h.estado_nuevo,
            h.nota_observacion,
            h.creado_en
         FROM historial_estados_incidente h
         LEFT JOIN usuarios u ON h.operador_id = u.id
         WHERE h.incidente_id = $1
         ORDER BY h.creado_en ASC`,
        [id]
    );

    return {
        ...incidente,
        confirmaciones,
        historial
    };
};

export const crearIncidente = async (datos, usuarioId) => {
    const {
        categoria_id,
        latitud,
        longitud,
        direccion_referencial,
        distrito,
        severidad,
        observaciones_ciudadano,
        foto_url,
        ia_diagnostico,
        ia_confianza,
        ia_severidad,
        ia_recomendacion
    } = datos;

    if (!categoria_id || latitud === undefined || longitud === undefined || !direccion_referencial || !distrito) {
        throw crearError('categoria_id, latitud, longitud, direccion_referencial y distrito son campos obligatorios', 400);
    }

    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);
    if (isNaN(lat) || isNaN(lng)) {
        throw crearError('Las coordenadas latitud y longitud deben ser valores numéricos válidos', 400);
    }

    // Resolver entidad asignada a partir de la categoría
    const { rows: categorias } = await pool.query(
        `SELECT id, entidad_responsable_id, severidad_defecto 
         FROM categorias_incidentes 
         WHERE id = $1`,
        [categoria_id]
    );

    if (categorias.length === 0) {
        throw crearError('Categoría de incidente no encontrada', 404);
    }

    const categoria = categorias[0];
    const entidadAsignadaId = categoria.entidad_responsable_id;

    // Determinar severidad
    let severidadFinal = categoria.severidad_defecto || 'MEDIA';
    if (severidad && SEVERIDADES_VALIDAS.includes(severidad)) {
        severidadFinal = severidad;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Generar folio correlativo anual
        const ticketFolio = await generarFolio(client);

        const { rows: nuevosIncidentes } = await client.query(
            `INSERT INTO incidentes (
                ticket_folio,
                entidad_asignada_id,
                usuario_creador_id,
                categoria_id,
                latitud,
                longitud,
                direccion_referencial,
                distrito,
                severidad,
                estado,
                observaciones_ciudadano,
                foto_url,
                ia_diagnostico,
                ia_confianza,
                ia_severidad,
                ia_recomendacion,
                confirmaciones_count
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, 'REGISTRADO', $10, $11, $12, $13, $14, $15, 1
            ) RETURNING *`,
            [
                ticketFolio,
                entidadAsignadaId,
                usuarioId,
                categoria_id,
                lat,
                lng,
                direccion_referencial.trim(),
                distrito.trim(),
                severidadFinal,
                observaciones_ciudadano ? observaciones_ciudadano.trim() : null,
                foto_url || null,
                ia_diagnostico || null,
                ia_confianza !== undefined && ia_confianza !== null ? parseFloat(ia_confianza) : null,
                ia_severidad || null,
                ia_recomendacion || null
            ]
        );

        const incidenteCreado = nuevosIncidentes[0];

        // Registrar primer estado en el historial de auditoría
        await client.query(
            `INSERT INTO historial_estados_incidente (
                incidente_id,
                operador_id,
                estado_anterior,
                estado_nuevo,
                nota_observacion
            ) VALUES ($1, $2, NULL, 'REGISTRADO', 'Reporte ciudadano inicial')`,
            [incidenteCreado.id, usuarioId]
        );

        await client.query('COMMIT');
        notificarIncidenteCreado(incidenteCreado);

        // Generar notificación persistente y en tiempo real para el ciudadano creador
        try {
            await crearNotificacionIncidente({
                usuarioId,
                incidenteId: incidenteCreado.id,
                ticketFolio: incidenteCreado.ticket_folio,
                estadoNuevo: 'REGISTRADO',
                notaObservacion: 'Reporte ciudadano recibido correctamente'
            });
        } catch (notifErr) {
            console.error('Advertencia al registrar notificación inicial:', notifErr.message);
        }

        return incidenteCreado;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const cambiarEstado = async (incidenteId, { nuevoEstado, motivoDesestimacion, notaObservacion }, operador) => {
    if (!nuevoEstado || !ESTADOS_VALIDOS.includes(nuevoEstado)) {
        throw crearError(`Estado inválido. Estados permitidos: ${ESTADOS_VALIDOS.join(', ')}`, 400);
    }

    if (nuevoEstado === 'DESESTIMADO') {
        if (!motivoDesestimacion || !motivoDesestimacion.trim()) {
            throw crearError('El motivo de desestimación es obligatorio cuando el estado es DESESTIMADO', 400);
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Obtener y bloquear incidente para garantizar coherencia en concurrencia
        const { rows: incidentes } = await client.query(
            `SELECT id, ticket_folio, usuario_creador_id, entidad_asignada_id, estado 
             FROM incidentes 
             WHERE id = $1 
             FOR UPDATE`,
            [incidenteId]
        );

        if (incidentes.length === 0) {
            throw crearError('Incidente no encontrado', 404);
        }

        const incidenteActual = incidentes[0];

        // Validar aislamiento multiorganizacional
        if (operador.rol === 'OPERADOR_ENTIDAD') {
            if (incidenteActual.entidad_asignada_id !== operador.entidad_id) {
                throw crearError('Acceso denegado: no pertenece a la entidad asignada de este incidente', 403);
            }
        } else if (operador.rol !== 'SUPER_ADMIN') {
            throw crearError('Acceso no autorizado para este perfil', 403);
        }

        // Si el estado no es DESESTIMADO, motivo_desestimacion DEBE ser NULL por restricción chk_motivo_desestimacion
        const motivoFinal = nuevoEstado === 'DESESTIMADO' ? motivoDesestimacion.trim() : null;

        const { rows: actualizados } = await client.query(
            `UPDATE incidentes
             SET estado = $1,
                 motivo_desestimacion = $2,
                 operador_resolucion_id = $3
             WHERE id = $4
             RETURNING *`,
            [nuevoEstado, motivoFinal, operador.id, incidenteId]
        );

        // Registrar entrada en el historial de auditoría
        const { rows: nuevoHistorial } = await client.query(
            `INSERT INTO historial_estados_incidente (
                incidente_id,
                operador_id,
                estado_anterior,
                estado_nuevo,
                nota_observacion
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [
                incidenteId,
                operador.id,
                incidenteActual.estado,
                nuevoEstado,
                notaObservacion ? notaObservacion.trim() : null
            ]
        );

        await client.query('COMMIT');
        notificarCambioEstado({
            incidenteId,
            entidadId: actualizados[0].entidad_asignada_id,
            nuevoEstado,
            historial: nuevoHistorial[0]
        });

        // Generar notificación persistente y en tiempo real únicamente si el estado cambió realmente
        if (incidenteActual.estado !== nuevoEstado && incidenteActual.usuario_creador_id) {
            try {
                await crearNotificacionIncidente({
                    usuarioId: incidenteActual.usuario_creador_id,
                    incidenteId,
                    ticketFolio: incidenteActual.ticket_folio || actualizados[0].ticket_folio,
                    estadoNuevo: nuevoEstado,
                    notaObservacion: notaObservacion ? notaObservacion.trim() : null,
                    motivoDesestimacion: motivoFinal
                });
            } catch (notifErr) {
                console.error('Advertencia al generar notificación de cambio de estado:', notifErr.message);
            }
        }

        return {
            ...actualizados[0],
            historial: nuevoHistorial[0]
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const confirmarIncidente = async (incidenteId, usuarioId, fotoAdicionalUrl = null) => {
    // 1. Verificar existencia del incidente
    const { rows: incidentes } = await pool.query(
        `SELECT id, entidad_asignada_id, usuario_creador_id, confirmaciones_count, estado 
         FROM incidentes 
         WHERE id = $1`,
        [incidenteId]
    );

    if (incidentes.length === 0) {
        throw crearError('Incidente no encontrado', 404);
    }

    const incidente = incidentes[0];

    // 2. Validar que el creador no se autoconfirme
    if (incidente.usuario_creador_id === usuarioId) {
        throw crearError('El creador del incidente no puede confirmar su propio reporte', 400);
    }

    // 3. Insertar confirmación
    try {
        const { rows: confirmaciones } = await pool.query(
            `INSERT INTO confirmaciones_incidente (
                incidente_id,
                usuario_id,
                foto_adicional_url
             ) VALUES ($1, $2, $3)
             RETURNING *`,
            [incidenteId, usuarioId, fotoAdicionalUrl || null]
        );

        // El trigger fn_sync_confirmaciones_count actualiza confirmaciones_count en incidentes automáticamente.
        const { rows: conteoActualizado } = await pool.query(
            `SELECT confirmaciones_count FROM incidentes WHERE id = $1`,
            [incidenteId]
        );

        const nuevoContador = conteoActualizado[0]?.confirmaciones_count;

        notificarConfirmacion({
            incidenteId,
            entidadId: incidente.entidad_asignada_id,
            nuevoContador
        });

        return {
            confirmacion: confirmaciones[0],
            confirmaciones_count: nuevoContador
        };
    } catch (error) {
        // Violación de restricción única uq_incidente_usuario
        if (error.code === '23505') {
            throw crearError('Ya has confirmado este incidente', 409);
        }
        throw error;
    }
};

