import { pool } from '../config/db.js';

export const obtenerEntidades = async () => {
    const { rows } = await pool.query(
        `SELECT id, sigla, nombre_oficial, jurisdiccion_competencia
         FROM entidades_publicas
         WHERE activa = true
         ORDER BY nombre_oficial ASC`
    );
    return rows;
};

export const obtenerCategorias = async () => {
    const { rows } = await pool.query(
        `SELECT id, nombre, severidad_defecto, icono_identificador, entidad_responsable_id
         FROM categorias_incidentes
         ORDER BY id ASC`
    );
    return rows;
};

