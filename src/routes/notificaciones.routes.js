import { Router } from 'express';
import * as notificacionesController from '../controllers/notificaciones.controller.js';
import { exigirToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', exigirToken('completa'), notificacionesController.listarMisNotificaciones);
router.patch('/leer-todas', exigirToken('completa'), notificacionesController.marcarTodasLeidas);
router.patch('/:id/leer', exigirToken('completa'), notificacionesController.marcarLeida);

export default router;
