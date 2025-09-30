import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";

const db = DatabaseService.getInstance().mysqlConnection;


export const createWillCall = async (req: Request, res: Response) => {
  let connection;
  const ip = getSystemIp(req);
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

    // Validate will_call_type
    if (!['ambient', 'airport'].includes(will_call_type)) {
      return res.status(400).json({
        success: false,
        message: "will_call_type must be either 'ambient' or 'airport'"
      });
    }

    // Validate required fields based on type
    if (will_call_type === 'airport' && (!airline || !flight)) {
      return res.status(400).json({
        success: false,
        message: "For airport type, airline and flight are required"
      });
    }

    if (will_call_type === 'ambient' && !delivery_address) {
      return res.status(400).json({
        success: false,
        message: "For ambient type, delivery address is required"
      });
    }

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

    // 2. Insert into pickup_customer table (common for both types)
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

    // 3. Handle type-specific data
    if (will_call_type === 'ambient') {
      // REGULAR/AMBIENT TYPE: Create delivery location and delivery person

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
      await connection.execute(
        `INSERT INTO delivery_person (
          order_id, delivery_name, delivery_email, delivery_phone, delivery_fax,
          \`w,ah,h\`, arsflight, saadelivery, bridges_tools, comments, assigned_driver, territory, mileage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

    } else if (will_call_type === 'airport') {
      // AIRPORT TYPE: Create routing and simplified delivery person

      // Insert into routing for airport type
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

      // Insert into delivery_person for airport type (only basic info)
      await connection.execute(
        `INSERT INTO delivery_person (
          order_id, delivery_name, delivery_email, delivery_phone, delivery_fax,
          \`w,ah,h\`, arsflight, saadelivery, bridges_tools, comments, assigned_driver, territory, mileage
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          orderId,
          '', // delivery_name not needed for airport
          '', // delivery_email not needed for airport
          '', // delivery_phone not needed for airport
          '', // delivery_fax not needed for airport
          weekend_or_holiday || '0',
          airport_recovery_same_flight || '1', // Default to 1 for airport
          same_address_add_delivery || '0',
          bridges_tolls || '0',
          comment || '',
          assign_driver_id || '',
          territory_id || '',
          mileage || ''
        ]
      );

      // NOTE: For airport type, we DON'T create delivery_locat records
      // because the delivery is to the airport, not a specific address
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
      message: `Will Call (${will_call_type}) created successfully`,
      data: {
        order_id: orderId,
        job_num: nextJobNum,
        will_call_type,
        status: 'pending',
        type_specific: will_call_type === 'airport' ? {
          airline,
          flight,
          airbill
        } : {
          delivery_facility,
          delivery_address
        }
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
        ip,
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

export const getWillCallById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get main will_call data
    const [willCall]: any = await db.execute(
      `SELECT * FROM will_call WHERE order_id = ? AND is_deleted = 0`,
      [id]
    );

    if (willCall.length === 0) {
      return res.status(404).json({ success: false, message: "Will Call not found" });
    }

    const orderId = willCall[0].order_id;

    // Get related data
    const [pickupCustomer]: any = await db.execute(
      `SELECT * FROM pickup_customer WHERE order_id = ?`,
      [orderId]
    );

    const [deliveryLocat]: any = await db.execute(
      `SELECT * FROM delivery_locat WHERE order_id = ?`,
      [orderId]
    );

    const [deliveryPerson]: any = await db.execute(
      `SELECT * FROM delivery_person WHERE order_id = ?`,
      [orderId]
    );

    const [routing]: any = await db.execute(
      `SELECT * FROM routing WHERE order_id = ?`,
      [orderId]
    );

    const responseData = {
      ...willCall[0],
      pickup_customer: pickupCustomer[0] || null,
      delivery_location: deliveryLocat[0] || null,
      delivery_person: deliveryPerson[0] || null,
      routing: routing[0] || null
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error: any) {
    console.error("Error fetching will call:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const updateWillCallStatus = async (req: Request, res: Response) => {
  let connection;
  const ip = getSystemIp(req);
  try {
    const { id } = req.params;
    const {
      status,
      updated_by,
      // Picked Up fields
      pickup_time,
      pickup_name,
      bags_count,
      pickup_comment,
      // Completed fields
      completion_time,
      shipping_method,
      tracking_ids,
    } = req.body;

    if (!status || !updated_by) {
      return res.status(400).json({
        success: false,
        message: "status and updated_by are required"
      });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();

    // Get current will call data including driver information
    const [currentWillCall]: any = await connection.execute(
      `SELECT * FROM will_call WHERE order_id = ?`,
      [id]
    );

    if (currentWillCall.length === 0) {
      return res.status(404).json({ success: false, message: "Will Call not found" });
    }

    const currentData = currentWillCall[0];
    const driverId = currentData.driver; // Get driver ID from will_call record

    // Validate status-specific required fields
    if (status === 'picked_up') {
      if (!pickup_time || !pickup_name || bags_count === undefined) {
        return res.status(400).json({
          success: false,
          message: "For 'picked_up' status, pickup_time, pickup_name, and bags_count are required"
        });
      }
    } else if (status === 'completed') {
      if (!completion_time || !shipping_method) {
        return res.status(400).json({
          success: false,
          message: "For 'completed' status, completion_time and shipping_method are required"
        });
      }
    }

    // Update will_call status and updated_by
    const [result]: any = await connection.execute(
      `UPDATE will_call SET status = ?, updated_by = ?, updated_date = NOW() WHERE order_id = ?`,
      [status, updated_by, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Will Call not found" });
    }

    // Handle willcalltime table updates
    if (status === 'picked_up' || status === 'completed') {
      // Check if willcalltime record exists
      const [existingWillCallTime]: any = await connection.execute(
        `SELECT * FROM willcalltime WHERE willcall_id = ?`,
        [id]
      );

      if (existingWillCallTime.length > 0) {
        // Update existing willcalltime record
        if (status === 'picked_up') {
          await connection.execute(
            `UPDATE willcalltime SET pickuptime = ? WHERE willcall_id = ?`,
            [pickup_time, id]
          );
        } else if (status === 'completed') {
          await connection.execute(
            `UPDATE willcalltime SET deliveredtime = ? WHERE willcall_id = ?`,
            [completion_time, id]
          );
        }
      } else {
        // Insert new willcalltime record
        if (status === 'picked_up') {
          await connection.execute(
            `INSERT INTO willcalltime (willcall_id, pickuptime) VALUES (?, ?)`,
            [id, pickup_time]
          );
        } else if (status === 'completed') {
          await connection.execute(
            `INSERT INTO willcalltime (willcall_id, deliveredtime) VALUES (?, ?)`,
            [id, completion_time]
          );
        }
      }
    }

    // Handle coordinates table updates based on status
    if (status === 'picked_up') {
      // Check if coordinate record exists
      const [existingCoordinate]: any = await connection.execute(
        "SELECT * FROM `driver_coordinates` WHERE order_id = ?",
        [id]
      );

      if (existingCoordinate.length > 0) {
        // Update existing coordinate record
        await connection.execute(
          `UPDATE driver_coordinates SET 
            pickup_name = ?, 
            bags_count = ?, 
            pickup_comment = ?,
            riderid = ?
           WHERE order_id = ?`,
          [
            pickup_name,
            bags_count,
            pickup_comment || '',
            driverId, // Use driver ID from will_call record
            id
          ]
        );
      } else {
        // Insert new coordinate record
        await connection.execute(
          `INSERT INTO driver_coordinates (
            order_id, riderid, pickup_name, bags_count, pickup_comment,
            start_lng, start_lat, end_lng, end_lat, distance
          ) VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0)`,
          [
            id,
            driverId, // Use driver ID from will_call record
            pickup_name,
            bags_count,
            pickup_comment || ''
          ]
        );
      }

      // Log the pickup
      await LogController.createLog({
        action: "update",
        module: "will_call_pickup",
        userId: updated_by,
        ip: ip,
        previousData: { status: currentData.status },
        payload: {
          order_id: id,
          status: 'picked_up',
          pickup_time,
          pickup_name,
          bags_count,
          pickup_comment,
          driver_id: driverId
        },
        message: `Will Call ${id} picked up by ${pickup_name} with ${bags_count} bags`
      });

    } else if (status === 'completed') {
      // Check if coordinate record exists
      const [existingCoordinate]: any = await connection.execute(
        "SELECT * FROM `driver_coordinates` WHERE order_id = ?",
        [id]
      );

      if (existingCoordinate.length > 0) {
        // Update existing coordinate record with completion data
        await connection.execute(
          `UPDATE \`driver_coordinates\` 
   SET ship_method = ?, 
       trackingId = ?, 
       riderid = ?
   WHERE order_id = ?`,
          [
            shipping_method,
            tracking_ids || '',
            driverId, // Use driver ID from will_call record
            id
          ]
        );
      } else {
        // Insert new coordinate record with completion data
        await connection.execute(
          "INSERT INTO `driver_coordinates` (order_id, riderid, ship_method, trackingId, start_lng, start_lat, end_lng, end_lat, distance) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0)",
          [
            id,
            driverId, // Use driver ID from will_call record
            shipping_method,
            tracking_ids || ''
          ]
        );
      }

      // Log the completion
      await LogController.createLog({
        action: "update",
        module: "will_call_completion",
        userId: updated_by,
        ip: ip,
        previousData: { status: currentData.status },
        payload: {
          order_id: id,
          status: 'completed',
          completion_time,
          shipping_method,
          tracking_ids,
          driver_id: driverId
        },
        message: `Will Call ${id} completed via ${shipping_method}`
      });
    }

    await connection.commit();

    res.json({
      success: true,
      message: `Will Call status updated to ${status} successfully`,
      data: {
        order_id: id,
        status: status,
        driver_id: driverId,
        ...(status === 'picked_up' && {
          pickup_time,
          pickup_name,
          bags_count,
          pickup_comment
        }),
        ...(status === 'completed' && {
          completion_time,
          shipping_method,
          tracking_ids
        })
      }
    });

  } catch (error: any) {
    if (connection) await connection.rollback();

    // Log the error
    await LogController.logError(
      "will_call_status",
      "update",
      error,
      req.body.updated_by,
      ip,
      {
        order_id: req.params.id,
        status: req.body.status,
        error_message: error.message
      }
    );

    console.error("Error updating will call status:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) connection.release();
  }
};

export const getWillCallStatusData = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Get will call basic info
    const [willCall]: any = await db.execute(
      `SELECT order_id, status, driver, willcall_type FROM will_call WHERE order_id = ?`,
      [id]
    );

    if (willCall.length === 0) {
      return res.status(404).json({ success: false, message: "Will Call not found" });
    }

    // Get willcalltime data
    const [willCallTime]: any = await db.execute(
      `SELECT pickuptime, deliveredtime FROM willcalltime WHERE willcall_id = ?`,
      [id]
    );

    // Get driver_coordinates data
    const [driverCoordinates]: any = await db.execute(
      `SELECT pickup_name, bags_count, pickup_comment, ship_method, trackingId FROM driver_coordinates WHERE order_id = ?`,
      [id]
    );

    const responseData = {
      order_id: parseInt(id),
      status: willCall[0].status,
      driver_id: willCall[0].driver,
      willcall_type: willCall[0].willcall_type,
      
      // Pickup data
      pickup_time: willCallTime[0]?.pickuptime || null,
      pickup_name: driverCoordinates[0]?.pickup_name || null,
      bags_count: driverCoordinates[0]?.bags_count || null,
      pickup_comment: driverCoordinates[0]?.pickup_comment || null,
      
      // Completion data
      completion_time: willCallTime[0]?.deliveredtime || null,
      shipping_method: driverCoordinates[0]?.ship_method || null,
      tracking_ids: driverCoordinates[0]?.trackingId || null
    };

    res.json({
      success: true,
      data: responseData
    });

  } catch (error: any) {
    console.error("Error fetching will call status data:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const assignDriverToWillCall = async (req: Request, res: Response) => {
  let connection;
  const ip = getSystemIp(req);
  try {
    const { id } = req.params;
    const { driver_id, updated_by } = req.body;

    if (!driver_id || !updated_by) {
      return res.status(400).json({
        success: false,
        message: "driver_id and updated_by are required"
      });
    }

    connection = await db.getConnection();

    // Update will_call table (set driver and status = 'assigned')
    const [willCallResult]: any = await connection.execute(
      `UPDATE will_call 
       SET driver = ?, updated_by = ?, updated_date = NOW(), status = 'assigned' 
       WHERE order_id = ?`,
      [driver_id, updated_by, id]
    );

    if (willCallResult.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Will Call not found" });
    }

    // Update delivery_person table if exists
    await connection.execute(
      `UPDATE delivery_person SET assigned_driver = ? WHERE order_id = ?`,
      [driver_id, id]
    );

    await connection.commit();

    // Log the assignment
    await LogController.logUpdate(
      "will_call",
      { order_id: id },
      { assigned_driver: driver_id, status: "assigned" },
      updated_by,
      ip
    );

    res.json({
      success: true,
      message: "Driver assigned to Will Call successfully"
    });

  } catch (error: any) {
    await handleError(
      "updating",
      "will_calls",
      error,
      req.body.created_by,
      ip,
      req.body
    );
    console.error("Error assigning driver to will call:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};
