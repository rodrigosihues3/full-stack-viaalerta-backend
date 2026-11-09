import { pool } from '../config/db.js';

const crearError = (mensaje, statusCode = 400) => {
    const error = new Error(mensaje);
    error.statusCode = statusCode;
    return error;
};

export const obtenerEntidades = async (incluirInactivas = false) => {
    const condicion = incluirInactivas ? '' : 'WHERE activa = true';
    const { rows } = await pool.query(
        `SELECT id, ruc, sigla, nombre_oficial, jurisdiccion_competencia, telefono_emergencia, correo_despacho, activa, creado_en
         FROM entidades_publicas
         ${condicion}
         ORDER BY nombre_oficial ASC`
    );
    return rows.map(r => ({ ...r, activo: r.activa }));
};

export const obtenerEntidadPorId = async (id) => {
    const { rows } = await pool.query(
        `SELECT id, ruc, sigla, nombre_oficial, jurisdiccion_competencia, telefono_emergencia, correo_despacho, activa, creado_en
         FROM entidades_publicas
         WHERE id = $1`,
        [id]
    );

    if (rows.length === 0) {
        throw crearError('Entidad no encontrada', 404);
    }

    return { ...rows[0], activo: rows[0].activa };
};

export const obtenerCategorias = async () => {
    const { rows } = await pool.query(
        `SELECT id, nombre, severidad_defecto, icono_identificador, entidad_responsable_id
         FROM categorias_incidentes
         ORDER BY id ASC`
    );
    return rows;
};

export const crearEntidad = async (datos) => {
    const nombreOficial = (datos.nombre_oficial || datos.nombre || '').trim();
    if (!nombreOficial) {
        throw crearError('El nombre oficial de la entidad es obligatorio', 400);
    }

    const jurisdiccion = (datos.jurisdiccion_competencia || datos.jurisdiccion || '').trim();
    if (!jurisdiccion) {
        throw crearError('La jurisdicción o competencia es obligatoria', 400);
    }

    let sigla = (datos.sigla || '').trim().toUpperCase();
    if (!sigla) {
        // Generar sigla predeterminada a partir de las iniciales o primera palabra
        const palabras = nombreOficial.split(/\s+/).filter(p => p.length > 2);
        sigla = palabras.length > 1
            ? palabras.map(p => p[0]).join('').substring(0, 10).toUpperCase()
            : nombreOficial.substring(0, 8).toUpperCase();
    }

    const ruc = datos.ruc ? String(datos.ruc).trim() : null;
    if (ruc && !/^\d{11}$/.test(ruc)) {
        throw crearError('El RUC debe tener exactamente 11 dígitos numéricos', 400);
    }

    // Resolver datos de contacto
    let telefono = datos.telefono_emergencia || null;
    let correo = datos.correo_despacho || null;

    if (datos.contacto) {
        if (typeof datos.contacto === 'object') {
            telefono = datos.contacto.telefono || telefono;
            correo = datos.contacto.email || datos.contacto.correo || correo;
        } else if (typeof datos.contacto === 'string') {
            if (datos.contacto.includes('@')) {
                correo = datos.contacto.trim();
            } else {
                telefono = datos.contacto.trim();
            }
        }
    }

    if (!correo) {
        correo = `contacto@${sigla.toLowerCase().replace(/[^a-z0-9]/g, '')}.gob.pe`;
    }

    const activa = datos.activa !== undefined ? Boolean(datos.activa) : (datos.activo !== undefined ? Boolean(datos.activo) : true);

    const { rows } = await pool.query(
        `INSERT INTO entidades_publicas (
            ruc, sigla, nombre_oficial, jurisdiccion_competencia, telefono_emergencia, correo_despacho, activa
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, ruc, sigla, nombre_oficial, jurisdiccion_competencia, telefono_emergencia, correo_despacho, activa, creado_en`,
        [ruc, sigla, nombreOficial, jurisdiccion, telefono, correo, activa]
    );

    return { ...rows[0], activo: rows[0].activa };
};

export const actualizarEntidad = async (id, datos) => {
    const actual = await obtenerEntidadPorId(id);

    const nombreOficial = datos.nombre_oficial !== undefined || datos.nombre !== undefined
        ? (datos.nombre_oficial || datos.nombre || '').trim()
        : actual.nombre_oficial;

    if (!nombreOficial) {
        throw crearError('El nombre oficial de la entidad no puede estar vacío', 400);
    }

    const sigla = datos.sigla !== undefined ? String(datos.sigla).trim().toUpperCase() : actual.sigla;
    if (!sigla) {
        throw crearError('La sigla no puede estar vacía', 400);
    }

    const jurisdiccion = datos.jurisdiccion_competencia !== undefined || datos.jurisdiccion !== undefined
        ? (datos.jurisdiccion_competencia || datos.jurisdiccion || '').trim()
        : actual.jurisdiccion_competencia;

    if (!jurisdiccion) {
        throw crearError('La jurisdicción no puede estar vacía', 400);
    }

    let ruc = actual.ruc;
    if (datos.ruc !== undefined) {
        ruc = datos.ruc ? String(datos.ruc).trim() : null;
        if (ruc && !/^\d{11}$/.test(ruc)) {
            throw crearError('El RUC debe tener exactamente 11 dígitos numéricos', 400);
        }
    }

    let telefono = datos.telefono_emergencia !== undefined ? datos.telefono_emergencia : actual.telefono_emergencia;
    let correo = datos.correo_despacho !== undefined ? datos.correo_despacho : actual.correo_despacho;

    if (datos.contacto) {
        if (typeof datos.contacto === 'object') {
            telefono = datos.contacto.telefono ?? telefono;
            correo = datos.contacto.email ?? datos.contacto.correo ?? correo;
        } else if (typeof datos.contacto === 'string') {
            if (datos.contacto.includes('@')) {
                correo = datos.contacto.trim();
            } else {
                telefono = datos.contacto.trim();
            }
        }
    }

    let activa = actual.activa;
    if (datos.activa !== undefined) activa = Boolean(datos.activa);
    else if (datos.activo !== undefined) activa = Boolean(datos.activo);

    const { rows } = await pool.query(
        `UPDATE entidades_publicas
         SET ruc = $1,
             sigla = $2,
             nombre_oficial = $3,
             jurisdiccion_competencia = $4,
             telefono_emergencia = $5,
             correo_despacho = $6,
             activa = $7
         WHERE id = $8
         RETURNING id, ruc, sigla, nombre_oficial, jurisdiccion_competencia, telefono_emergencia, correo_despacho, activa, creado_en`,
        [ruc, sigla, nombreOficial, jurisdiccion, telefono, correo, activa, id]
    );

    return { ...rows[0], activo: rows[0].activa };
};

export const cambiarEstadoEntidad = async (id, activo) => {
    if (typeof activo !== 'boolean') {
        throw crearError('El campo activo debe ser un valor booleano', 400);
    }

    const { rows } = await pool.query(
        `UPDATE entidades_publicas
         SET activa = $1
         WHERE id = $2
         RETURNING id, ruc, sigla, nombre_oficial, jurisdiccion_competencia, telefono_emergencia, correo_despacho, activa, creado_en`,
        [activo, id]
    );

    if (rows.length === 0) {
        throw crearError('Entidad no encontrada', 404);
    }

    return { ...rows[0], activo: rows[0].activa };
};

export const eliminarEntidad = async (id) => {
    const { rows } = await pool.query(
        `UPDATE entidades_publicas
         SET activa = FALSE
         WHERE id = $1
         RETURNING id, ruc, sigla, nombre_oficial, activa`,
        [id]
    );

    if (rows.length === 0) {
        throw crearError('Entidad no encontrada', 404);
    }

    return {
        mensaje: 'Entidad desactivada correctamente',
        entidad: { ...rows[0], activo: rows[0].activa }
    };
};
