import { Router } from 'express';
import * as incidentesController from '../controllers/incidentes.controller.js';
import { exigirToken } from '../middlewares/auth.middleware.js';
import { exigirRol } from '../middlewares/role.middleware.js';

const router = Router();

// 1. Rutas específicas / estáticas primero:
router.get('/', exigirToken('completa'), incidentesController.listarIncidentes);
router.get('/cercanos', exigirToken('completa'), incidentesController.obtenerCercanos);

// 2. Rutas dinámicas con parámetros al final:
router.get('/:id', exigirToken('completa'), incidentesController.obtenerIncidente);
router.post('/', exigirToken('completa'), exigirRol('CIUDADANO'), incidentesController.crearIncidente);
router.patch('/:id/estado', exigirToken('completa'), exigirRol('OPERADOR_ENTIDAD', 'SUPER_ADMIN'), incidentesController.cambiarEstado);
router.post('/:id/confirmar', exigirToken('completa'), exigirRol('CIUDADANO'), incidentesController.confirmarIncidente);

export default router;

