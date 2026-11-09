import * as authService from '../services/auth.service.js';

export const registro = async (req, res) => {
    try {
        const nuevoUsuario = await authService.registrarCiudadano(req.body);
        return res.status(201).json(nuevoUsuario);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const login = async (req, res) => {
    try {
        const resultado = await authService.iniciarSesion(req.body);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const configurar2FA = async (req, res) => {
    try {
        const resultado = await authService.configurar2FA(req.usuario.id);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const activar2FA = async (req, res) => {
    try {
        const { codigo } = req.body;
        if (!codigo) {
            return res.status(400).json({ error: 'El código es requerido' });
        }
        const resultado = await authService.activar2FA(req.usuario.id, codigo);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const verificar2FA = async (req, res) => {
    try {
        const { codigo } = req.body;
        if (!codigo) {
            return res.status(400).json({ error: 'El código es requerido' });
        }
        const resultado = await authService.verificar2FA(req.usuario.id, codigo);
        return res.status(200).json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const perfil = async (req, res) => {
    try {
        return res.status(200).json({ user: req.usuario });
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};

export const consultarDni = async (req, res) => {
    try {
        const { dni } = req.params;
        if (!/^\d{8}$/.test(dni)) {
            return res.status(400).json({ error: 'El DNI debe tener 8 dígitos numéricos' });
        }

        const resultado = await authService.consultarDniEnReniec(dni);
        if (!resultado) {
            return res.status(404).json({ error: 'No se encontraron datos para el DNI ingresado' });
        }

        return res.json(resultado);
    } catch (error) {
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({ error: error.message });
    }
};


