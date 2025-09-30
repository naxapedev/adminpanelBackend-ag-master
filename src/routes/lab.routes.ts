import { Router } from "express";
import {
  createLab,
  getLabById,
  getAllLabs,
  updateLab,
  deleteLab,
  getLabsByTerritoryIdDropdown,
  getAllActiveLabs,
} from "../controllers/lab.Controller.js";

const router = Router();

// ✅ Create
router.post("/", createLab);

// ✅ Get all labs (summary)
router.get("/", getAllLabs);
router.get("/active/dropdown", getAllActiveLabs);
router.get("/dropdown/:id", getLabsByTerritoryIdDropdown);

// ✅ Get lab by id (details)
router.get("/:id", getLabById);

// ✅ Update (partial update)
router.put("/:id", updateLab);

// ✅ Soft delete
router.delete("/:id", deleteLab);

export default router;
