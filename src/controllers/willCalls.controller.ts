import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";

const db = DatabaseService.getInstance().mysqlConnection;


export const createWillCall = async (req: Request, res: Response) => {
  let connection;
  try {
    const {
      // Shared
      territory_id,
      will_call_type, // "regular" (ambient) | "airport"
      lab_id,

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
      created_by
    } = req.body;

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Generate job number (get the latest job number and increment)
    const [latestJob]: any = await connection.execute(
      `SELECT job_num FROM will_call ORDER BY order_id DESC LIMIT 1`
    );
    
    let nextJobNum = "000001"; // Default starting job number
    if (latestJob.length > 0) {
      const lastJobNum = latestJob[0].job_num;
      if (lastJobNum && !isNaN(lastJobNum)) {
        nextJobNum = String(parseInt(lastJobNum) + 1).padStart(6, '0');
      }
    }

    // 1. Insert into will_call table
    const [willCallResult]: any = await connection.execute(
      `INSERT INTO will_call (
        willcall_type, clinicId, job_num, pickup_facility, pick_address, pick_address2,
        pick_city, pick_state, pick_zip, pick_instr, status, unseen, lab_id,
        created_by, created_date, updated_by, updated_date, is_deleted, is_active, is_routed, driver
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), 0, 1, 0, ?)`,
      [
        will_call_type,
        pickup_clinic_id,
        nextJobNum,
        pickup_facility,
        pickup_address,
        pickup_address2 || '',
        pickup_city,
        pickup_state,
        pickup_zip,
        pickup_instruction || '',
        'pending', // default status
        1, // default unseen
        lab_id,
        created_by,
        created_by, // updated_by same as created_by initially
        assign_driver_id || null
      ]
    );

    const orderId = willCallResult.insertId;

    // 2. Insert into pickup_customer table
    if (pickup_contact_name || pickup_contact_phone || pickup_contact_email) {
      await connection.execute(
        `INSERT INTO pickup_customer (
          order_id, cutomer_name, customer_email, customer_phone, customer_fax,
          quantities, weight, airport_tender, attempted_deliver, elid
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          pickup_contact_name || '',
          pickup_contact_email || '',
          pickup_contact_phone || '',
          pickup_contact_fax || '',
          quantities || '',
          weight || '',
          airport_tender || '0',
          attempted_delivery || '0',
          elid || ''
        ]
      );
    }

    // 3. Handle delivery information based on will_call_type
    if (will_call_type === 'regular') {
      // Insert into delivery_locat for regular type
      if (delivery_clinic_id || delivery_facility || delivery_address) {
        await connection.execute(
          `INSERT INTO delivery_locat (
            order_id, ClinicId, delivery_facility, delivery_address, delivery_address2,
            delivery_city, deliver_state, delivery_zip, instruction
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            delivery_clinic_id || '',
            delivery_facility || '',
            delivery_address || '',
            delivery_address2 || '',
            delivery_city || '',
            delivery_state || '',
            delivery_zip || '',
            delivery_instruction || ''
          ]
        );
      }

      // Insert into delivery_person for regular type
      if (delivery_contact_name || delivery_contact_phone || delivery_contact_email) {
        await connection.execute(
          `INSERT INTO delivery_person (
            order_id, delivery_name, delivery_email, delivery_phone, delivery_fax,
            w,ah,h, arsflight, saadelivery, bridges_tools, comments, assigned_driver, territory, mileage
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            delivery_contact_name || '',
            delivery_contact_email || '',
            delivery_contact_phone || '',
            delivery_contact_fax || '',
            weekend_or_holiday || '0',
            airport_recovery_same_flight || '0',
            same_address_add_delivery || '0',
            bridges_tolls || '0',
            comment || '',
            assign_driver_id || '',
            territory_id || '',
            mileage || ''
          ]
        );
      }
    } else if (will_call_type === 'airport') {
      // Insert into routing for airport type
      if (airline || flight || airbill) {
        await connection.execute(
          `INSERT INTO routing (
            order_id, airline, filgthnum, WayBill
          ) VALUES (?, ?, ?, ?)`,
          [
            orderId,
            airline || '',
            flight || '',
            airbill || ''
          ]
        );
      }

      // Insert into delivery_person for airport type (without delivery location)
      if (delivery_contact_name || delivery_contact_phone || delivery_contact_email) {
        await connection.execute(
          `INSERT INTO delivery_person (
            order_id, delivery_name, delivery_email, delivery_phone, delivery_fax,
            w,ah,h, arsflight, saadelivery, bridges_tools, comments, assigned_driver, territory, mileage
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            orderId,
            delivery_contact_name || '',
            delivery_contact_email || '',
            delivery_contact_phone || '',
            delivery_contact_fax || '',
            weekend_or_holiday || '0',
            airport_recovery_same_flight || '0',
            same_address_add_delivery || '0',
            bridges_tolls || '0',
            comment || '',
            assign_driver_id || '',
            territory_id || '',
            mileage || ''
          ]
        );
      }
    }

    await connection.commit();

    // Log the creation
    await LogController.logCreation("will_call", {
      order_id: orderId,
      will_call_type,
      job_num: nextJobNum,
      lab_id,
      territory_id
    }, created_by, req.ip);

    res.status(201).json({
      success: true,
      message: "Will Call created successfully",
      data: {
        order_id: orderId,
        job_num: nextJobNum,
        will_call_type,
        status: 'pending'
      }
    });

  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error("❌ Error creating Will Call:", error);
    
    // Log the error
    if (req.body.created_by) {
      await LogController.logError(
        "will_call", 
        "create", 
        error, 
        req.body.created_by, 
        req.ip, 
        req.body
      );
    }

    res.status(500).json({ 
      success: false, 
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};
