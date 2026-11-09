import { Router } from 'express';
import * as adminController from '../controllers/admin.controller.js';
import * as entidadesController from '../controllers/entidades.controller.js';

const router = Router();

// Métricas de gobernanza metropolitana
router.get('/metricas', adminController.obtenerMetricas);

// Gestión y auditoría de usuarios
router.get('/usuarios', adminController.listarUsuarios);
router.patch('/usuarios/:id/estado', adminController.cambiarEstadoUsuario);
router.post('/usuarios/:id/notificar', adminController.notificarUsuario);

// Gestión de entidades públicas bajo ruta admin
router.get('/entidades', entidadesController.listarEntidades);
router.get('/entidades/:id', entidadesController.obtenerEntidad);
router.post('/entidades', entidadesController.crearEntidad);
router.put('/entidades/:id', entidadesController.actualizarEntidad);
router.patch('/entidades/:id/estado', entidadesController.cambiarEstadoEntidad);
router.delete('/entidades/:id', entidadesController.eliminarEntidad);

export default router;

