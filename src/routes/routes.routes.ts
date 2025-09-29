import express from "express";
import { createRoute, deleteRoute, getAllRoutes, getRouteById, updateRoute, getRouteDetailsForDriverChangeById, updateRouteDriver } from "../controllers/routes.controller.js";


const router = express.Router();

// CRUD routes
router.post("/", createRoute);

router.get("/", getAllRoutes);

router.get("/:id", getRouteById);
router.get("/fetchDriver/:id", getRouteDetailsForDriverChangeById);

router.put("/:id", updateRoute);

router.put("/updateDriver/:id", updateRouteDriver);

router.delete("/:id", deleteRoute);

export default router;
