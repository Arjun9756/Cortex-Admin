import { Router } from 'express';
import { AdminController } from './admin.controller.js';

const router = Router();

router.post('/login', AdminController.login);
router.get('/', AdminController.getAll);
router.post('/', AdminController.create);
router.get('/:id', AdminController.getById);
router.put('/:id', AdminController.update);
router.delete('/:id', AdminController.delete);

export default router;
