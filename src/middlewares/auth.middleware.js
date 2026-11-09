import { pool } from '../config/db.js';
import { verificarToken } from '../utils/jwt.js';

export const exigirToken = (etapaRequerida) => {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Token no proporcionado' });
            }

            const token = authHeader.split(' ')[1];
            let payload;
            try {
                payload = verificarToken(token);
            } catch (err) {
                return res.status(401).json({ error: 'Token inválido o expirado' });
            }

            if (payload.etapa !== etapaRequerida) {
                return res.status(403).json({ error: 'Este token no permite esta acción' });
            }

            const usuarioId = payload.sub || payload.id;
            const { rows } = await pool.query(
                `SELECT id, entidad_id, rol, dni, email, nombres, apellidos, dos_pasos_activo, activo 
                 FROM usuarios 
                 WHERE id = $1`,
                [usuarioId]
            );

            if (rows.length === 0 || !rows[0].activo) {
                return res.status(401).json({ error: 'Usuario no encontrado o inactivo' });
            }

            req.usuario = rows[0];
            next();
        } catch (error) {
            return res.status(500).json({ error: 'Error interno en la autenticación' });
        }
    };
};

export const authMiddleware = exigirToken('completa');

