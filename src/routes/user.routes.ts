// routes/userRoutes.ts
import express from 'express';
import {
  createUser,
  updateUser,
  deleteUser,
  getUsers,
  getUserById
} from '../controllers/user.controller.js';

const router = express.Router();

router.post('/', createUser);
router.get('/', getUsers);
router.get('/:id', getUserById);
router.put('/:user_id', updateUser); 
router.delete('/:user_id', deleteUser);

export default router;