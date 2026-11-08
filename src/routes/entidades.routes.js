import { Router } from 'express';
import * as entidadesController from '../controllers/entidades.controller.js';
import { exigirToken } from '../middlewares/auth.middleware.js';

const router = Router();

router.get('/', exigirToken('completa'), entidadesController.listarEntidades);
router.get('/categorias', exigirToken('completa'), entidadesController.listarCategorias);

export default router;

