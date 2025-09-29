// routes/driverRoutes.ts
import express from 'express';
import {
  getDrivers,
//   getDriverById,
//   updateDriverStatus,
  getTerritories,
//   getCompanies,
  getDriverDocuments
} from '../controllers/driver.controller.js';

const router = express.Router();

router.get('/', getDrivers);
router.get('/:id/documents', getDriverDocuments);
router.get('/territories', getTerritories);
// router.get('/companies', getCompanies);
// router.get('/:id', getDriverById);
// router.patch('/:id/status', updateDriverStatus);

export default router;