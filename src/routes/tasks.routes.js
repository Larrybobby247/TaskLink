import { Router } from 'express';
import * as tasksController from '../controllers/tasks.controller.js';
import * as applicationsController from '../controllers/applications.controller.js';
import { requireAuth, requireVerifiedEmail } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { requireTaskOwnership } from '../middleware/ownership.middleware.js';
import { createTaskSchema, applyToTaskSchema, searchTasksQuerySchema } from '../validators/task.validators.js';

const router = Router();

router.get('/', validate(searchTasksQuerySchema, 'query'), tasksController.searchTasks);
router.get('/saved', requireAuth, tasksController.getSavedTasks);
router.get('/mine', requireAuth, tasksController.getMyTasks);
router.get('/:id', tasksController.getTask);

router.post('/', requireAuth, requireVerifiedEmail, validate(createTaskSchema), tasksController.createTask);
router.patch('/:id', requireAuth, tasksController.updateTask);
router.delete('/:id', requireAuth, tasksController.deleteTask);
router.post('/:id/publish', requireAuth, tasksController.publishTask);
router.post('/:id/pause', requireAuth, tasksController.pauseTask);

router.post('/:id/save', requireAuth, tasksController.saveTask);
router.delete('/:id/save', requireAuth, tasksController.unsaveTask);

router.post('/:taskId/applications', requireAuth, requireVerifiedEmail, validate(applyToTaskSchema), applicationsController.applyToTask);
router.get('/:taskId/applications', requireAuth, requireTaskOwnership, applicationsController.listApplicationsForTask);

export default router;
