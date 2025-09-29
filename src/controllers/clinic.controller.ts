import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import { getSystemIp, handleError, toUtcTime } from "../lib/utils.js";
import LogController from "./log.controller.js";
import { Clinic } from "../types/index.js";
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


// Create Clinic
export const createClinic = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { data, user_id } = req.body;

    // 🔑 Check if clinic_id or clinic_name already exists
    const [dupRows] = await mysql.query<(Clinic & RowDataPacket)[]>(
      `SELECT ClinicId 
       FROM clinics 
       WHERE (clinic_id = ? OR clinic_name = ?)
         AND is_deleted = 0`,
      [data.clinic_id, data.clinic_name]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Clinic ID or Name already exists" });
    }

    const query = `
      INSERT INTO clinics (
        territory_id, clinic_id, clinic_name, clinic_email, clinic_phone, clinic_fax,
        clinic_address1, clinic_address2, clinic_city, clinic_state, clinic_zip,
        clinic_manager, Cmanager_email, PT_count, multiple_routes, lockbox, combo,
        time, opendays, draw_week, draw_days, comments, priority, lab_id,
        delivery_id, ondemand, clinic_password, cutoff_time,
        created_by, created_date, is_deleted, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, 1)
    `;

    const [result] = await mysql.query<ResultSetHeader>(query, [
      data.territory_id,
      data.clinic_id,
      data.clinic_name,
      data.clinic_email,
      data.clinic_phone,
      data.clinic_fax,
      data.clinic_address1,
      data.clinic_address2,
      data.clinic_city,
      data.clinic_state,
      data.clinic_zip,
      data.clinic_manager,
      data.Cmanager_email,
      data.PT_count,
      data.multiple_routes,
      data.lockbox,
      data.combo,
      JSON.stringify(normalizeSchedule(data.time)),
      JSON.stringify(data.opendays),
      data.draw_week,
      JSON.stringify(data.draw_days),
      data.comments,
      data.priority,
      data.lab_id,
      data.delivery_id,
      data.ondemand,
      data.clinic_password,
      toUtcTime(data.cutoff_time),
      user_id,
    ]);

    await LogController.logCreation("clinics", data, user_id, getSystemIp(req));

    res.status(201).json({ message: "Clinic created", ClinicId: result.insertId });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Clinic ID or Name already exists" });
    }
    await handleError("creating", "clinics", err, req.body.user_id, req.ip, req.body);
    res.status(500).json({ error: err.message });
  }
};

// Get All Clinics
export const getAllClinics = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<(Clinic & RowDataPacket)[]>(`
      SELECT 
        c.ClinicId,
        c.clinic_id,
        c.clinic_name,
        l.lab_name AS lab_name,
        t.territory_name AS territory_name,
        c.clinic_phone,
        c.ondemand,
        c.is_active,
        CONCAT(c.clinic_address1, ', ', c.clinic_city, ', ', c.clinic_state, ' ', c.clinic_zip) AS address
      FROM clinics c
      LEFT JOIN labs l ON c.lab_id = l.lab_id
      LEFT JOIN territories t ON c.territory_id = t.territory_id
      WHERE c.is_deleted = 0
    `);

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


export const getClinicById = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const { id } = req.params;

    const [rows] = await mysql.query<(Clinic & RowDataPacket)[]>(`
      SELECT 
        c.ClinicId,
        c.clinic_id,
        c.delivery_id,
        
        c.clinic_email,
        c.clinic_fax,
        c.clinic_address1,
        c.clinic_address2,
        c.clinic_city,
        c.clinic_state,
        c.clinic_zip,
        c.clinic_manager,
        c.Cmanager_email,
        c.PT_count,
        c.multiple_routes,
        c.lockbox,
        c.combo,
        c.cutoff_time,
        JSON_UNQUOTE(c.time) AS time,
        JSON_UNQUOTE(c.opendays) AS opendays,
        c.draw_week,
        JSON_UNQUOTE(c.draw_days) AS draw_days,
        c.comments,
        c.priority,
        c.lab_id,
        c.territory_id,

        c.clinic_name,
        l.lab_name AS lab_name,
        t.territory_name AS territory_name,
        c.clinic_phone,
        c.ondemand,
        c.is_active,
        CONCAT(c.clinic_address1, ', ', c.clinic_city, ', ', c.clinic_state, ' ', c.clinic_zip) AS address
      FROM clinics c
      LEFT JOIN labs l ON c.lab_id = l.lab_id
      LEFT JOIN territories t ON c.territory_id = t.territory_id
      WHERE c.is_deleted = 0 AND c.ClinicId = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Clinic not found" });
    }

    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};



// Update Clinic
export const updateClinic = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const id = req.params.id;
    const { newData, user_id } = req.body;

    // check if exists
    const [oldRows] = await mysql.query<(Clinic & RowDataPacket)[]>(
      "SELECT * FROM clinics WHERE ClinicId = ? AND is_deleted = 0",
      [id]
    );
    if (!oldRows.length) return res.status(404).json({ message: "Not found" });

    const previousData = oldRows[0];

    // 🔑 Check if clinic_id or clinic_name already exists (excluding this record)
    const [dupRows] = await mysql.query<(Clinic & RowDataPacket)[]>(
      `SELECT ClinicId 
       FROM clinics 
       WHERE (clinic_id = ? OR clinic_name = ?)
         AND ClinicId <> ?
         AND is_deleted = 0`,
      [newData.clinic_id, newData.clinic_name, id]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Clinic ID or Name already exists" });
    }

    const query = `
      UPDATE clinics SET
        clinic_id = ?, clinic_name = ?, clinic_email = ?, clinic_phone = ?, clinic_fax = ?,
        clinic_address1 = ?, clinic_address2 = ?, clinic_city = ?, clinic_state = ?, clinic_zip = ?,
        clinic_manager = ?, Cmanager_email = ?, PT_count = ?, multiple_routes = ?, lockbox = ?, combo = ?,
        time = ?, opendays = ?, draw_week = ?, draw_days = ?, comments = ?, priority = ?, lab_id = ?,
        territory_id = ?, delivery_id = ?, ondemand = ?, clinic_password = ?, cutoff_time = ?,
        is_active = ?, updated_by = ?, updated_date = NOW()
      WHERE ClinicId = ? AND is_deleted = 0
    `;

    await mysql.query(query, [
      newData.clinic_id,
      newData.clinic_name,
      newData.clinic_email,
      newData.clinic_phone,
      newData.clinic_fax,
      newData.clinic_address1,
      newData.clinic_address2,
      newData.clinic_city,
      newData.clinic_state,
      newData.clinic_zip,
      newData.clinic_manager,
      newData.Cmanager_email,
      newData.PT_count,
      newData.multiple_routes,
      newData.lockbox,
      newData.combo,
      JSON.stringify(normalizeSchedule(newData.time)),
      JSON.stringify(newData.opendays),
      newData.draw_week,
      JSON.stringify(newData.draw_days),
      newData.comments,
      newData.priority,
      newData.lab_id,
      newData.territory_id,
      newData.delivery_id,
      newData.ondemand,
      newData.clinic_password,
      toUtcTime(newData.cutoff_time),
      newData.is_active,
      user_id,
      id,
    ]);

    await LogController.logUpdate("clinics", previousData, { id, ...newData }, user_id, getSystemIp(req));

    res.json({ message: "Clinic updated" });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Clinic ID or Name already exists" });
    }
    await handleError("updating", "clinics", err, req.body.user_id, req.ip, { clinicId: req.params.id, ...req.body });
    res.status(500).json({ error: err.message });
  }
};

// Delete Clinic (soft delete)
export const deleteClinic = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { user_id } = req.body;
    const id = req.params.id;

    const [oldRows] = await mysql.query<(Clinic & RowDataPacket)[]>(
      "SELECT * FROM clinics WHERE ClinicId = ? AND is_deleted = 0",
      [id]
    );
    if (!oldRows.length) return res.status(404).json({ message: "Not found" });

    await mysql.query("UPDATE clinics SET is_deleted = 1, updated_by = ?, updated_date = NOW() WHERE ClinicId = ?", [
      user_id,
      id,
    ]);

    await LogController.logDeletion("clinics", { id }, user_id, getSystemIp(req));

    res.json({ message: "Clinic soft deleted" });
  } catch (err: any) {
    await handleError("deleting", "clinics", err, req.body.user_id, req.ip, { clinicId: req.params.id, ...req.body });
    res.status(500).json({ error: err.message });
  }
};


