import { Router } from "express";
import { createDelivery, deleteDelivery, getAllDeliveries, getAllDeliveriesById, getDeliveriesByLabIdDropdown, updateDelivery, } from "../controllers/delivery.controller.js";


const router = Router();

// Create new delivery
router.post("/", createDelivery);

// Fetch all deliveries (with lab + territory names)
router.get("/", getAllDeliveries);


router.get("/dropdown/:id", getDeliveriesByLabIdDropdown);
router.get("/:id", getAllDeliveriesById);
// Update delivery
router.put("/:id", updateDelivery);

// Soft delete delivery
router.delete("/:id", deleteDelivery);

export default router;
