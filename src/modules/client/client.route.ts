import { Router } from 'express';
import { ClientController } from './client.controller.js';

const router = Router();

router.get('/', ClientController.getAll);
router.post('/', ClientController.create);
router.get('/:id', ClientController.getById);
router.put('/:id', ClientController.update);
router.patch('/:id/status', ClientController.updateStatus);
router.delete('/:id', ClientController.delete);

export default router;
