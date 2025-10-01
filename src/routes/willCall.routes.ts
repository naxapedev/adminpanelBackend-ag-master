import express from 'express';
import {
    addWillCallComment,
    assignDriverToWillCall,
createWillCall,
deleteWillCall,
deleteWillCallComment,
getWillCallById,
getWillCalls,
getWillCallStatusData,
updateWillCallStatusData
} from '../controllers/willCalls.controller.js';

const router = express.Router();

router.get("/", getWillCalls);
router.post('/', createWillCall);
router.get('/:id', getWillCallById);
router.get('/:id/status-data', getWillCallStatusData);
router.patch('/:id/status-data', updateWillCallStatusData);
router.patch('/:id/assign-driver', assignDriverToWillCall);
router.post("/comment", addWillCallComment);
router.delete("/comment/:commentid", deleteWillCallComment);
router.delete("/:id", deleteWillCall);


export default router;