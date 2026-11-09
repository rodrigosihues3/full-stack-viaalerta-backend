import { Router } from 'express';
import * as usuariosController from '../controllers/usuarios.controller.js';
import { exigirToken } from '../middlewares/auth.middleware.js';

const router = Router();

// Rutas del portal ciudadano / usuarios autenticados
router.get('/notificaciones', exigirToken('completa'), usuariosController.obtenerNotificaciones);
router.patch('/notificaciones/:id/leer', exigirToken('completa'), usuariosController.marcarNotificacionLeida);

export default router;

