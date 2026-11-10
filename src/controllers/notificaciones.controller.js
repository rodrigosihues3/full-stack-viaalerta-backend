import * as notificacionesService from '../services/notificaciones.service.js';

export const listarMisNotificaciones = async (req, res) => {
    try {
        const resultado = await notificacionesService.listarNotificacionesUsuario(req.usuario.id);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const marcarLeida = async (req, res) => {
    try {
        const { id } = req.params;
        const notificacion = await notificacionesService.marcarComoLeida(id, req.usuario.id);
        return res.status(200).json(notificacion);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const marcarTodasLeidas = async (req, res) => {
    try {
        const resultado = await notificacionesService.marcarTodasComoLeidas(req.usuario.id);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};
