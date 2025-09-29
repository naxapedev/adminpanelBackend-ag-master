import express from "express";
import { createState, updateState, deleteState, getActiveStates, getStates } from "../controllers/state.controller.js";

const router = express.Router();

router.get("/", getStates);
router.post("/", createState);          // Create

router.put("/:id", updateState);        // Update
router.delete("/:id", deleteState);     // Soft delete

router.get("/active", getActiveStates);

export default router;