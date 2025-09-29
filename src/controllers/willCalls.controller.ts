import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";


export const createWillCall = async (req: Request, res: Response) => {
  let connection;
  try {
    const {
      // Shared
      will_call_type, // "regular" (ambient) | "airport"
      lab_id,
      customer_job_no,

      // Pickup Info
      pickup_clinic_id,
      pickup_facility,
      pickup_address,
      pickup_address2,
      pickup_city,
      pickup_state,
      pickup_zip,
      pickup_instruction,
      pickup_contact_name,
      pickup_contact_phone,
      pickup_contact_email,
      pickup_contact_fax,

      // Delivery Info (regular)
      delivery_clinic_id,
      delivery_facility,
      delivery_address,
      delivery_address2,
      delivery_city,
      delivery_state,
      delivery_zip,
      delivery_instruction,
      delivery_contact_name,
      delivery_contact_phone,
      delivery_contact_email,
      delivery_contact_fax,

      // Delivery Info (airport specific)
      airline,
      flight,
      airbill,

      // Quantities
      quantities,
      weight,
      mileage,

      // Additional Options
      airport_tender,
      attempted_delivery,
      weekend_or_holiday,
      airport_recovery_same_flight,
      same_address_add_delivery,
      bridges_tolls,
      elid,
      comment,

      // Assignment
      assign_driver_id,
      territory_id,
    } = req.body;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // -------------------------------
    // Step 1: Insert into will_calls table
    // -------------------------------
    const [result]: any = await connection.execute(
      `INSERT INTO will_calls
       (will_call_type, lab_id, customer_job_no, assign_driver_id, territory_id,
        quantities, weight, mileage, elid, comment,
        airport_tender, attempted_delivery, weekend_or_holiday, airport_recovery_same_flight,
        same_address_add_delivery, bridges_tolls, created_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        will_call_type,
        lab_id,
        customer_job_no,
        assign_driver_id,
        territory_id,
        quantities,
        weight,
        mileage,
        elid,
        comment,
        airport_tender ? 1 : 0,
        attempted_delivery ? 1 : 0,
        weekend_or_holiday ? 1 : 0,
        airport_recovery_same_flight ? 1 : 0,
        same_address_add_delivery ? 1 : 0,
        bridges_tolls ? 1 : 0,
      ]
    );

    const willCallId = result.insertId;

    // -------------------------------
    // Step 2: Insert pickup info
    // -------------------------------
    await connection.execute(
      `INSERT INTO will_call_pickup
       (will_call_id, clinic_id, facility, address, address2, city, state, zip,
        instruction, contact_name, contact_phone, contact_email, contact_fax)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        willCallId,
        pickup_clinic_id,
        pickup_facility,
        pickup_address,
        pickup_address2,
        pickup_city,
        pickup_state,
        pickup_zip,
        pickup_instruction,
        pickup_contact_name,
        pickup_contact_phone,
        pickup_contact_email,
        pickup_contact_fax,
      ]
    );

    // -------------------------------
    // Step 3: Insert delivery info
    // -------------------------------
    if (will_call_type === "airport") {
      await connection.execute(
        `INSERT INTO will_call_delivery_airport
         (will_call_id, airline, flight, airbill,
          address, city, state, zip, contact_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          willCallId,
          airline,
          flight,
          airbill,
          delivery_address,
          delivery_city,
          delivery_state,
          delivery_zip,
          delivery_contact_name,
        ]
      );
    } else {
      await connection.execute(
        `INSERT INTO will_call_delivery
         (will_call_id, clinic_id, facility, address, address2, city, state, zip,
          instruction, contact_name, contact_phone, contact_email, contact_fax)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          willCallId,
          delivery_clinic_id,
          delivery_facility,
          delivery_address,
          delivery_address2,
          delivery_city,
          delivery_state,
          delivery_zip,
          delivery_instruction,
          delivery_contact_name,
          delivery_contact_phone,
          delivery_contact_email,
          delivery_contact_fax,
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      message: "Will Call created successfully",
      will_call_id: willCallId,
    });
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error("❌ Error creating Will Call:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};
