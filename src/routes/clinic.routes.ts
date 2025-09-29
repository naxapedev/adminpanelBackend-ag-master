import express from "express";
import { createClinic, deleteClinic, getAllClinics, getClinicById, updateClinic } from "../controllers/clinic.controller.js";
const router = express.Router();

router.post("/", createClinic);     // Create
router.get("/", getAllClinics);     // Fetch All
router.get("/:id", getClinicById);     
router.put("/:id", updateClinic);   // Update
router.delete("/:id", deleteClinic); // Delete (soft)

export default router;
