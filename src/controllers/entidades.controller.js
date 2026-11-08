import * as entidadesService from '../services/entidades.service.js';

export const listarEntidades = async (req, res) => {
    try {
        const entidades = await entidadesService.obtenerEntidades();
        return res.status(200).json(entidades);
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

