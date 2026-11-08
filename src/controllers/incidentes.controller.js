import * as incidentesService from '../services/incidentes.service.js';

export const listarIncidentes = async (req, res) => {
    try {
        const incidentes = await incidentesService.listarIncidentes(req.usuario);
        return res.status(200).json(incidentes);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const obtenerIncidente = async (req, res) => {
    try {
        const { id } = req.params;
        const incidente = await incidentesService.obtenerIncidentePorId(id, req.usuario);
        return res.status(200).json(incidente);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const crearIncidente = async (req, res) => {
    try {
        const nuevoIncidente = await incidentesService.crearIncidente(req.body, req.usuario.id);
        return res.status(201).json(nuevoIncidente);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const cambiarEstado = async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await incidentesService.cambiarEstado(id, req.body, req.usuario);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const confirmarIncidente = async (req, res) => {
    try {
        const { id } = req.params;
        const { foto_adicional_url } = req.body;
        const resultado = await incidentesService.confirmarIncidente(id, req.usuario.id, foto_adicional_url);
        return res.status(201).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

