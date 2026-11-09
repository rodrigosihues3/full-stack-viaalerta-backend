import { Router } from 'express';
import * as entidadesController from '../controllers/entidades.controller.js';
import { exigirToken } from '../middlewares/auth.middleware.js';
import { exigirRol } from '../middlewares/role.middleware.js';

const router = Router();

// Rutas de lectura de catálogos (accesibles por usuarios autenticados)
router.get('/', exigirToken('completa'), entidadesController.listarEntidades);
router.get('/categorias', exigirToken('completa'), entidadesController.listarCategorias);
router.get('/:id', exigirToken('completa'), entidadesController.obtenerEntidad);

// Operaciones CRUD administrativas (restringidas a SUPER_ADMIN)
router.post('/', exigirToken('completa'), exigirRol('SUPER_ADMIN'), entidadesController.crearEntidad);
router.put('/:id', exigirToken('completa'), exigirRol('SUPER_ADMIN'), entidadesController.actualizarEntidad);
router.patch('/:id/estado', exigirToken('completa'), exigirRol('SUPER_ADMIN'), entidadesController.cambiarEstadoEntidad);
router.delete('/:id', exigirToken('completa'), exigirRol('SUPER_ADMIN'), entidadesController.eliminarEntidad);

export default router;
