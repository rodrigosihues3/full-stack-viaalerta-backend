import * as entidadesService from '../services/entidades.service.js';

export const listarEntidades = async (req, res) => {
    try {
        const incluirInactivas = req.query.incluirInactivas === 'true' || req.query.todas === 'true';
        const entidades = await entidadesService.obtenerEntidades(incluirInactivas);
        return res.status(200).json(entidades);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const obtenerEntidad = async (req, res) => {
    try {
        const { id } = req.params;
        const entidad = await entidadesService.obtenerEntidadPorId(id);
        return res.status(200).json(entidad);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const listarCategorias = async (req, res) => {
    try {
        const categorias = await entidadesService.obtenerCategorias();
        return res.status(200).json(categorias);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const crearEntidad = async (req, res) => {
    try {
        const nuevaEntidad = await entidadesService.crearEntidad(req.body);
        return res.status(201).json(nuevaEntidad);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const actualizarEntidad = async (req, res) => {
    try {
        const { id } = req.params;
        const entidadActualizada = await entidadesService.actualizarEntidad(id, req.body);
        return res.status(200).json(entidadActualizada);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const cambiarEstadoEntidad = async (req, res) => {
    try {
        const { id } = req.params;
        const activo = req.body.activa !== undefined ? req.body.activa : req.body.activo;
        const entidadActualizada = await entidadesService.cambiarEstadoEntidad(id, activo);
        return res.status(200).json(entidadActualizada);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const eliminarEntidad = async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await entidadesService.eliminarEntidad(id);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};
