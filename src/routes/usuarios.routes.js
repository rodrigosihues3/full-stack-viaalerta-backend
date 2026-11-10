import { Router } from 'express';
import * as usuariosController from '../controllers/usuarios.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';

const router = Router();

// Rutas de notificaciones compatibles con montaje en /api/notificaciones y /api/usuarios
// 1. Rutas específicas / estáticas primero:
router.get('/', authMiddleware, usuariosController.obtenerNotificaciones);
router.get('/notificaciones', authMiddleware, usuariosController.obtenerNotificaciones);

router.patch('/leer-todas', authMiddleware, usuariosController.marcarTodasLeidas);
router.patch('/notificaciones/leer-todas', authMiddleware, usuariosController.marcarTodasLeidas);

// 2. Rutas dinámicas con parámetros al final:
router.patch('/:id/leer', authMiddleware, usuariosController.marcarNotificacionLeida);
router.patch('/notificaciones/:id/leer', authMiddleware, usuariosController.marcarNotificacionLeida);

export default router;

