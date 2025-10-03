// routes/userRoutes.ts
import express from 'express';
import {
  createUser,
  updateUser,
  deleteUser,
  getUsers,
  getUserById,
  loginUser,
  refreshToken,
  logoutUser,
} from '../controllers/user.controller.js';
import { authMiddleware } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/', createUser);
router.get('/', getUsers);
router.get('/:id', getUserById);
router.put('/:user_id', updateUser); 
router.delete('/:user_id', deleteUser);
router.post('/login', loginUser);
router.post('/refresh-token', refreshToken);
router.post('/logout', authMiddleware, logoutUser);
export default router;