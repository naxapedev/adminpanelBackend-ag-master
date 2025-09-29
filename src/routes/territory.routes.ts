import { Router } from "express";
import { createTerritory, getTerritoryById,getAllTerritories, updateTerritory, deleteTerritory, getTerritoriesByStateId, getAllTerritoriesForDropdown } from "../controllers/territory.controller.js";

const router = Router();

router.post("/", createTerritory);
router.get("/", getAllTerritories);
router.get("/dropdown", getAllTerritoriesForDropdown);

// 👇 put this before /:id
router.get("/state/:state_id", getTerritoriesByStateId);

router.get("/:id", getTerritoryById);
router.put("/:id", updateTerritory);
router.delete("/:id", deleteTerritory);

export default router;
