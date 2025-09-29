import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { Delivery } from "../types/index.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";

import dayjs from "dayjs";



function normalizeSchedule(schedule: Record<string, { open: string; close: string }>) {
  const normalized: Record<string, { open: string; close: string }> = {};

  for (const day in schedule) {
    normalized[day] = {
      open: dayjs.utc(`1970-01-01 ${schedule[day].open}`, "YYYY-MM-DD HH:mm").format("HH:mm:ss"),
      close: dayjs.utc(`1970-01-01 ${schedule[day].close}`, "YYYY-MM-DD HH:mm").format("HH:mm:ss"),
    };
  }

  return normalized;
}


// ✅ Create Delivery
export const createDelivery = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { data, user_id } = req.body;

    // Check if delivery_id or delivery_name already exists
    const [rows] = await mysql.query(
      `SELECT delivery_id, delivery_name FROM delivery WHERE delivery_id = ? OR delivery_name = ?`,
      [data.delivery_id, data.delivery_name]
    );

    if ((rows as any[]).length > 0) {
      return res.status(400).json({ error: "Delivery ID or Name already exists" });
    }

    // Insert new record
    const query = `
      INSERT INTO delivery 
        (territory_id, delivery_id, delivery_name, delivery_email, delivery_phone, delivery_fax,
         delivery_address1, delivery_address2, delivery_city, delivery_state, delivery_zip,
         delivery_manager, Cmanager_email, PT_count, multiple_routes, time, opendays,
         draw_week, draw_days, comments, priority, lab_id, created_by, created_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await mysql.query<ResultSetHeader>(query, [
      data.territory_id,
      data.delivery_id,
      data.delivery_name,
      data.delivery_email,
      data.delivery_phone,
      data.delivery_fax,
      data.delivery_address1,
      data.delivery_address2,
      data.delivery_city,
      data.delivery_state,
      data.delivery_zip,
      data.delivery_manager,
      data.Cmanager_email,
      data.PT_count,
      data.multiple_routes,
      JSON.stringify(normalizeSchedule(data.time)),
      JSON.stringify(data.opendays),
      data.draw_week,
      JSON.stringify(data.draw_days),
      data.comments,
      data.priority,
      data.lab_id,
      user_id,
    ]);

    await LogController.logCreation("delivery", data, user_id, getSystemIp(req));

    res.status(201).json({ message: "Delivery created", DeliveryId: result.insertId });
  } catch (err: any) {
    await handleError("creating", "delivery", err, req.body.user_id, req.ip, req.body);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Fetch all Deliveries (with joins for lab & territory names)
export const getAllDeliveries = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<(Delivery & RowDataPacket)[]>(`
      SELECT 
        d.DeliveryId,
        d.delivery_id,
        d.delivery_name,
        l.lab_name,
        t.territory_name,
        d.delivery_manager,
        d.delivery_phone,
        d.delivery_address1
      FROM delivery d
      LEFT JOIN labs l ON d.lab_id = l.lab_id
      LEFT JOIN territories t ON d.territory_id = t.territory_id
      WHERE d.is_deleted = FALSE
    `);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

export const getAllDeliveriesById = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { id } = req.params;

    let query = `
      SELECT 
        d.DeliveryId,
        d.delivery_id,
        d.delivery_name,
        d.delivery_manager,
        d.delivery_phone,
        d.delivery_email,
        d.delivery_fax,
        d.delivery_address1,
        d.delivery_address2,
        d.delivery_city,
        d.delivery_state,
        d.delivery_zip,
        d.Cmanager_email,
        d.PT_count,
        d.multiple_routes,
        d.time,
        d.opendays,
        d.draw_week,  
        d.draw_days,
        d.comments,
        d.priority,
        d.is_active,

        -- ✅ Lab details
        d.lab_id,
        l.lab_name,

        -- ✅ Territory details
        d.territory_id,
        t.territory_name
      FROM delivery d
      LEFT JOIN labs l ON d.lab_id = l.lab_id
      LEFT JOIN territories t ON d.territory_id = t.territory_id
      WHERE d.is_deleted = FALSE 
        AND d.is_active = TRUE
    `;

    const params: any[] = [];

    if (id) {
      query += ` AND d.DeliveryId = ?`;
      params.push(id);
    }

    const [rows] = await mysql.query<(Delivery & RowDataPacket)[]>(query, params);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
// new clininc
export const getDeliveriesByLabIdDropdown = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { id } = req.params;

    const query = `
      SELECT 
        d.DeliveryId,
        d.delivery_name
      FROM delivery d
      WHERE d.lab_id = ?
        AND d.is_deleted = FALSE
        AND d.is_active = TRUE
    `;

    const [rows] = await mysql.query<(Delivery & RowDataPacket)[]>(query, [id]);

    if (!(rows as any[]).length) {
      return res.status(404).json({ message: "No deliveries found for this lab" });
    }

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};



// ✅ Update Delivery
export const updateDelivery = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const id = req.params.id;
    const { newData, user_id } = req.body;

    // check if record exists
    const [oldRows] = await mysql.query<(Delivery & RowDataPacket)[]>(
      "SELECT * FROM delivery WHERE DeliveryId = ? AND is_deleted = FALSE",
      [id]
    );
    if (!oldRows.length) {
      return res.status(404).json({ message: "Not found" });
    }
    const previousData = oldRows[0];

    // 🔑 Check if delivery_id or delivery_name already exists (excluding this record)
    const [dupRows] = await mysql.query<(Delivery & RowDataPacket)[]>(
      `SELECT DeliveryId 
       FROM delivery 
       WHERE (delivery_id = ? OR delivery_name = ?)
         AND DeliveryId <> ?
         AND is_deleted = FALSE`,
      [newData.delivery_id, newData.delivery_name, id]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Delivery ID or Name already exists" });
    }

    const query = `
      UPDATE delivery SET 
        territory_id = ?, 
        delivery_id = ?, 
        delivery_name = ?, 
        delivery_email = ?, 
        delivery_phone = ?, 
        delivery_fax = ?, 
        delivery_address1 = ?, 
        delivery_address2 = ?, 
        delivery_city = ?, 
        delivery_state = ?, 
        delivery_zip = ?, 
        delivery_manager = ?, 
        Cmanager_email = ?, 
        PT_count = ?, 
        multiple_routes = ?, 
        time = ?, 
        opendays = ?, 
        draw_week = ?, 
        draw_days = ?, 
        comments = ?, 
        priority = ?, 
        lab_id = ?, 
        updated_by = ?, 
        updated_date = NOW()
      WHERE DeliveryId = ? AND is_deleted = FALSE
    `;

    await mysql.query(query, [
      newData.territory_id,
      newData.delivery_id,
      newData.delivery_name,
      newData.delivery_email,
      newData.delivery_phone,
      newData.delivery_fax,
      newData.delivery_address1,
      newData.delivery_address2,
      newData.delivery_city,
      newData.delivery_state,
      newData.delivery_zip,
      newData.delivery_manager,
      newData.Cmanager_email,
      newData.PT_count,
      newData.multiple_routes,
      JSON.stringify(normalizeSchedule(newData.time)),
      JSON.stringify(newData.opendays),
      newData.draw_week,
      JSON.stringify(newData.draw_days),
      newData.comments,
      newData.priority,
      newData.lab_id,
      user_id,
      id,
    ]);

    await LogController.logUpdate(
      "delivery",
      previousData,
      { id, ...newData },
      user_id,
      getSystemIp(req)
    );

    res.json({ message: "Delivery updated" });
  } catch (err: any) {
    await handleError("updating", "delivery", err, req.body.user_id, req.ip, {
      deliveryId: req.params.id,
      ...req.body,
    });
    res.status(500).json({ error: err.message });
  }
};



// ✅ Soft Delete Delivery
export const deleteDelivery = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { user_id } = req.body;
    const id = req.params.id;

    const [oldRows] = await mysql.query<(Delivery & RowDataPacket)[]>(
      "SELECT * FROM delivery WHERE DeliveryId = ? AND is_deleted = FALSE",
      [id]
    );
    if (!oldRows.length) return res.status(404).json({ message: "Not found" });
    const previousData = oldRows[0];

    await mysql.query("UPDATE delivery SET is_deleted=TRUE WHERE DeliveryId=?", [id]);

    await LogController.logDeletion("delivery", { id }, user_id, getSystemIp(req));

    res.json({ message: "Delivery soft deleted" });
  } catch (err: any) {
    await handleError("deleting", "delivery", err, req.body.user_id, getSystemIp(req), {
      deliveryId: req.params.id,
      ...req.body,
    });
    res.status(500).json({ error: err.message });
  }
};
