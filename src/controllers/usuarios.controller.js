import * as adminService from '../services/admin.service.js';

export const obtenerNotificaciones = async (req, res) => {
    try {
        const notificaciones = await adminService.obtenerNotificacionesDeUsuario(req.usuario.id);
        return res.status(200).json(notificaciones);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const marcarNotificacionLeida = async (req, res) => {
    try {
        const { id } = req.params;
        const resultado = await adminService.marcarNotificacionLeida(req.usuario.id, id);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const marcarTodasLeidas = async (req, res) => {
    try {
        const resultado = await adminService.marcarTodasNotificacionesLeidas(req.usuario.id);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

