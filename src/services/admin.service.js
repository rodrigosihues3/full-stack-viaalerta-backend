import bcrypt from 'bcryptjs';
import { pool } from '../config/db.js';
import { notificarNuevaNotificacion } from './socket.service.js';

const crearError = (mensaje, statusCode = 400) => {
    const error = new Error(mensaje);
    error.statusCode = statusCode;
    return error;
};

/**
 * Obtiene métricas globales de gobernanza para el SUPER_ADMIN.
 */
export const obtenerMetricas = async () => {
    // 1. Entidades públicas registradas y desglose
    const { rows: entidadesRows } = await pool.query(`
        SELECT 
            COUNT(*)::INT AS total,
            COUNT(CASE WHEN UPPER(sigla) = 'MML' THEN 1 END)::INT AS mml,
            COUNT(CASE WHEN UPPER(sigla) = 'SEDAPAL' THEN 1 END)::INT AS sedapal
        FROM entidades_publicas
    `);

    // 2. Operadores y ciudadanos
    const { rows: usuariosRows } = await pool.query(`
        SELECT 
            COUNT(CASE WHEN rol = 'OPERADOR_ENTIDAD' THEN 1 END)::INT AS total_operadores,
            COUNT(CASE WHEN rol = 'CIUDADANO' THEN 1 END)::INT AS total_ciudadanos
        FROM usuarios
    `);

    // 3. Incidentes para cálculo de fiabilidad global
    const { rows: incidentesRows } = await pool.query(`
        SELECT 
            COUNT(*)::INT AS total_incidentes,
            COUNT(CASE WHEN estado != 'DESESTIMADO' THEN 1 END)::INT AS incidentes_validos,
            COUNT(CASE WHEN estado = 'DESESTIMADO' THEN 1 END)::INT AS incidentes_desestimados
        FROM incidentes
    `);

    const totalEntidades = entidadesRows[0]?.total || 0;
    const mmlCount = entidadesRows[0]?.mml || 0;
    const sedapalCount = entidadesRows[0]?.sedapal || 0;

    const totalOperadores = usuariosRows[0]?.total_operadores || 0;
    const totalCiudadanos = usuariosRows[0]?.total_ciudadanos || 0;

    const totalIncidentes = incidentesRows[0]?.total_incidentes || 0;
    const incidentesValidos = incidentesRows[0]?.incidentes_validos || 0;

    let fiabilidadGlobal = 100.00;
    if (totalIncidentes > 0) {
        fiabilidadGlobal = Number(((incidentesValidos / totalIncidentes) * 100).toFixed(2));
    }

    return {
        total_entidades: totalEntidades,
        desglose_entidades: {
            MML: mmlCount,
            SEDAPAL: sedapalCount
        },
        total_operadores: totalOperadores,
        total_ciudadanos: totalCiudadanos,
        fiabilidad_global: fiabilidadGlobal
    };
};

/**
 * Lista todos los usuarios con estadísticas de incidentes y cálculo de fiabilidad para ciudadanos.
 */
export const listarUsuarios = async () => {
    const { rows } = await pool.query(`
        SELECT 
            u.id, u.dni, u.email, u.nombres, u.apellidos, u.rol, u.activo, u.dos_pasos_activo,
            u.entidad_id, ep.nombre_oficial AS entidad_nombre, u.creado_en,
            COUNT(i.id)::INT AS total_reportes,
            COUNT(CASE WHEN i.estado = 'DESESTIMADO' THEN 1 END)::INT AS reportes_desestimados,
            COUNT(CASE WHEN i.estado IN ('EVALUACION', 'REPARACION', 'RESUELTO') THEN 1 END)::INT AS reportes_validos
        FROM usuarios u
        LEFT JOIN entidades_publicas ep ON ep.id = u.entidad_id
        LEFT JOIN incidentes i ON i.usuario_creador_id = u.id
        GROUP BY u.id, ep.nombre_oficial
        ORDER BY u.creado_en DESC
    `);

    return rows.map(u => {
        const totalReportes = parseInt(u.total_reportes, 10) || 0;
        const reportesValidos = parseInt(u.reportes_validos, 10) || 0;
        const reportesDesestimados = parseInt(u.reportes_desestimados, 10) || 0;

        let fiabilidad_pct = 100;
        if (totalReportes > 0) {
            fiabilidad_pct = Math.round((reportesValidos / totalReportes) * 100);
        }

        return {
            id: u.id,
            dni: u.dni,
            email: u.email,
            nombres: u.nombres,
            apellidos: u.apellidos,
            rol: u.rol,
            activo: u.activo,
            dos_pasos_activo: u.dos_pasos_activo,
            entidad_id: u.entidad_id,
            entidad_nombre: u.entidad_nombre,
            creado_en: u.creado_en,
            total_reportes: totalReportes,
            reportes_desestimados: reportesDesestimados,
            reportes_validos: reportesValidos,
            fiabilidad_pct
        };
    });
};

/**
 * Cambia el estado operativo (activo/inactivo) de un usuario.
 * Impide que un Superadmin se desactive a sí mismo.
 */
export const cambiarEstadoUsuario = async (adminId, usuarioId, activo) => {
    if (adminId === usuarioId) {
        throw crearError('No es posible modificar el estado operativo de su propia cuenta de Superadmin', 400);
    }

    if (typeof activo !== 'boolean') {
        throw crearError('El campo activo es obligatorio y debe ser un valor booleano', 400);
    }

    const { rows } = await pool.query(
        `UPDATE usuarios
         SET activo = $1, actualizado_en = NOW()
         WHERE id = $2
         RETURNING id, dni, email, nombres, apellidos, rol, entidad_id, activo, dos_pasos_activo, creado_en, actualizado_en`,
        [activo, usuarioId]
    );

    if (rows.length === 0) {
        throw crearError('Usuario no encontrado', 404);
    }

    return rows[0];
};

/**
 * Emite una notificación institucional a un usuario.
 */
export const notificarUsuario = async (usuarioId, { titulo, mensaje, tipo, severidad }, ioInstance = null) => {
    if (!titulo || !String(titulo).trim()) {
        throw crearError('El título de la notificación es obligatorio', 400);
    }

    if (!mensaje || !String(mensaje).trim()) {
        throw crearError('El mensaje de la notificación es obligatorio', 400);
    }

    const { rows: userRows } = await pool.query('SELECT id FROM usuarios WHERE id = $1', [usuarioId]);
    if (userRows.length === 0) {
        throw crearError('Usuario destinatario no encontrado', 404);
    }

    const tipoVal = tipo ? String(tipo).trim().toUpperCase() : 'ADVERTENCIA';

    const { rows } = await pool.query(
        `INSERT INTO notificaciones_usuario (usuario_id, titulo, mensaje, tipo)
         VALUES ($1, $2, $3, $4)
         RETURNING id, usuario_id, titulo, mensaje, tipo, leido, creado_en`,
        [usuarioId, String(titulo).trim(), String(mensaje).trim(), tipoVal]
    );

    const notificacionCreada = rows[0];
    if (severidad) {
        notificacionCreada.severidad = severidad;
    }

    // Emisión en tiempo real vía WebSocket a la sala personal del usuario destinatario
    notificarNuevaNotificacion(usuarioId, notificacionCreada, ioInstance);

    return notificacionCreada;
};

/**
 * Retorna las notificaciones de un usuario ordenadas por fecha descendente.
 */
export const obtenerNotificacionesDeUsuario = async (usuarioId) => {
    const { rows } = await pool.query(
        `SELECT id, usuario_id, titulo, mensaje, tipo, leido, creado_en
         FROM notificaciones_usuario
         WHERE usuario_id = $1
         ORDER BY creado_en DESC`,
        [usuarioId]
    );
    return rows;
};

/**
 * Marca una notificación como leída.
 */
export const marcarNotificacionLeida = async (usuarioId, notificacionId) => {
    const { rows } = await pool.query(
        `UPDATE notificaciones_usuario
         SET leido = TRUE
         WHERE id = $1 AND usuario_id = $2
         RETURNING id, usuario_id, titulo, mensaje, tipo, leido, creado_en`,
        [notificacionId, usuarioId]
    );

    if (rows.length === 0) {
        throw crearError('Notificación no encontrada', 404);
    }

    return rows[0];
};

/**
 * Marca todas las notificaciones de un usuario como leídas.
 */
export const marcarTodasNotificacionesLeidas = async (usuarioId) => {
    const { rows } = await pool.query(
        `UPDATE notificaciones_usuario
         SET leido = TRUE
         WHERE usuario_id = $1 AND leido = FALSE
         RETURNING id, usuario_id, titulo, mensaje, tipo, leido, creado_en`,
        [usuarioId]
    );

    return { actualizadas: rows.length };
};

/**
 * Aprovisiona un nuevo operador técnico institucional adscrito a una entidad pública.
 */
export const crearOperadorInstitucional = async (datos) => {
    const { nombres, apellidos, dni, email, password, entidad_id } = datos || {};

    // 1. Validar campos obligatorios
    if (!nombres || !apellidos || !dni || !email || !password || !entidad_id) {
        throw crearError('Todos los campos son obligatorios: nombres, apellidos, dni, email, password y entidad_id', 400);
    }

    const nombresTrim = String(nombres).trim();
    const apellidosTrim = String(apellidos).trim();
    const emailTrim = String(email).trim().toLowerCase();
    const dniTrim = String(dni).trim();
    const passwordVal = String(password);

    if (!nombresTrim || !apellidosTrim || !dniTrim || !emailTrim || !passwordVal) {
        throw crearError('Los campos no pueden estar vacíos', 400);
    }

    const dniRegex = /^[0-9]{8}$/;
    if (!dniRegex.test(dniTrim)) {
        throw crearError('El DNI debe contener exactamente 8 dígitos numéricos', 400);
    }

    // 2. Verificar en PostgreSQL que entidad_id exista y esté activa
    const { rows: entidadRows } = await pool.query(
        'SELECT id, sigla, nombre_oficial, activa FROM entidades_publicas WHERE id = $1',
        [entidad_id]
    );

    if (entidadRows.length === 0) {
        throw crearError('La entidad pública especificada no existe.', 404);
    }

    const entidad = entidadRows[0];
    if (!entidad.activa) {
        throw crearError('La entidad pública especificada no se encuentra activa.', 400);
    }

    // 3. Hashear la contraseña temporal
    const passwordHash = await bcrypt.hash(passwordVal, 10);

    // 4. Ejecutar el INSERT INTO usuarios fijando explícitamente rol, entidad_id, activo y dos_pasos_activo
    const { rows: usuarioRows } = await pool.query(
        `INSERT INTO usuarios (
            nombres,
            apellidos,
            dni,
            email,
            password_hash,
            entidad_id,
            rol,
            activo,
            dos_pasos_activo
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'OPERADOR_ENTIDAD', TRUE, FALSE)
        RETURNING id, dni, email, nombres, apellidos, rol, entidad_id, activo, dos_pasos_activo, creado_en, actualizado_en`,
        [nombresTrim, apellidosTrim, dniTrim, emailTrim, passwordHash, entidad_id]
    );

    const nuevoOperador = usuarioRows[0];

    // 5. Retornar los datos del operador creado junto con el nombre/sigla de su entidad adscrita
    return {
        ...nuevoOperador,
        entidad_nombre: entidad.nombre_oficial,
        entidad_sigla: entidad.sigla
    };
};


