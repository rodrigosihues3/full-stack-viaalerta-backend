import { Router } from 'express';
import {
    registro,
    login,
    configurar2FA,
    activar2FA,
    verificar2FA,
    desactivar2FA,
    perfil,
    consultarDni
} from '../controllers/auth.controller.js';
import { exigirToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/reniec/:dni', consultarDni);
router.post('/registro', registro);
router.post('/login', login);
router.post('/2fa/configurar', exigirToken('completa'), configurar2FA);
router.post('/2fa/activar', exigirToken('completa'), activar2FA);
router.post('/2fa/desactivar', exigirToken('completa'), desactivar2FA);
router.post('/2fa/verificar', exigirToken('pendiente-2fa'), verificar2FA);
router.get('/perfil', exigirToken('completa'), perfil);

export default router;

