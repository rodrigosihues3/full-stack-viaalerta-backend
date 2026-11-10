import * as adminService from '../services/admin.service.js';

export const obtenerMetricas = async (req, res) => {
    try {
        const metricas = await adminService.obtenerMetricas();
        return res.status(200).json(metricas);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const listarUsuarios = async (req, res) => {
    try {
        const usuarios = await adminService.listarUsuarios();
        return res.status(200).json(usuarios);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const cambiarEstadoUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const { activo } = req.body;

        const usuarioActualizado = await adminService.cambiarEstadoUsuario(req.usuario.id, id, activo);
        return res.status(200).json(usuarioActualizado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const notificarUsuario = async (req, res) => {
    try {
        const { id } = req.params;
        const io = req.app?.get ? req.app.get('io') : null;
        const notificacion = await adminService.notificarUsuario(id, req.body, io);
        return res.status(201).json(notificacion);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

