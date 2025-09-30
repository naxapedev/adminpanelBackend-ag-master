import express from 'express';
import {
    assignDriverToWillCall,
createWillCall,
getWillCallById,
getWillCallStatusData,
updateWillCallStatus
} from '../controllers/willCalls.controller.js';

const router = express.Router();

router.post('/', createWillCall);
router.get('/:id', getWillCallById);
router.get('/:id/status-data', getWillCallStatusData);
router.patch('/:id/status-data', updateWillCallStatus);
router.patch('/:id/assign-driver', assignDriverToWillCall);


export default router;