import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import Log from "../models/mongodb/logModel.js";
import { RowDataPacket } from "mysql2";
import { Lab } from "../types/index.js";
import LogController from "./log.controller.js";
import { handleError } from "../lib/utils.js";

// helper to extract IP
function getSystemIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    ""
  );
}

// ✅ Create Lab
export const createLab = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { data, user_id } = req.body;

    // 🔎 Check if labcode or lab_name already exists
    const [dupRows] = await mysql.query<(Lab & RowDataPacket)[]>(
      `SELECT lab_id 
       FROM labs 
       WHERE ( lab_name = ?)
         AND is_deleted = FALSE`,
      [data.labcode, data.lab_name]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Lab code or Lab name already exists" });
    }

    const query = `
      INSERT INTO labs 
      (labcode, lab_name, lab_contact, lab_phone, lab_email, lab_address, lab_city, lab_state, lab_zip,
       state_id, territory_id, comments, created_by, created_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result]: any = await mysql.query(query, [
      data.labcode || "",
      data.lab_name,
      data.lab_contact,
      data.lab_phone,
      data.lab_email,
      data.lab_address,
      data.lab_city,
      data.lab_state,
      data.lab_zip,
      data.state_id,
      data.territory_id,
      data.comments,
      user_id,
    ]);

    await LogController.logCreation("labs", data, user_id, getSystemIp(req));

    res.status(201).json({ message: "Lab created", lab_id: result.insertId });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Lab code or Lab name already exists" });
    }
    await handleError("creating", "labs", err, req.body.user_id, req.ip, req.body);
    res.status(500).json({ error: err.message });
  }
};


// ✅ Get Lab by ID (only selected fields)
export const getLabById = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<(Lab & RowDataPacket)[]>(
      `SELECT 
        lab_id,
        lab_name,
        lab_contact,
        lab_phone,
        lab_email,
        lab_address,
        lab_city,
        lab_state,
        lab_zip,
        comments
      FROM labs
      WHERE lab_id = ? AND is_deleted = FALSE`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Not found" });

    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


export const getLabsByTerritoryIdDropdown = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const { id } = req.params;

    const [rows] = await mysql.query<(Lab & RowDataPacket)[]>(
      `SELECT 
         lab_id, 
         lab_name
       FROM labs
       WHERE territory_id = ? 
         AND is_deleted = FALSE 
         AND is_active = TRUE`,
      [id]
    );

    if (!(rows as any[]).length) {
      return res.status(404).json({ message: "No labs found for this territory" });
    }

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


// ✅ Get All Labs (summary)
export const getAllLabs = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<(Lab & RowDataPacket)[]>(
      `SELECT 
        lab_id,
        lab_name,
        lab_contact,
        lab_phone,
        lab_email,
        lab_address,
        is_active,
        lab_state,
        lab_city
      FROM labs
      WHERE is_deleted = FALSE`
    );

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


// ✅ Update Lab (partial updates)
export const updateLab = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const id = req.params.id;
    const { newData, user_id } = req.body;

    // fetch old data
    const [oldRows] = await mysql.query<(Lab & RowDataPacket)[]>(
      "SELECT * FROM labs WHERE lab_id = ? AND is_deleted = FALSE",
      [id]
    );
    if (!oldRows.length) {
      return res.status(404).json({ message: "Not found" });
    }
    const previousData = oldRows[0];

    // 🔎 Check if labcode or lab_name already exists (excluding this record)
    const [dupRows] = await mysql.query<(Lab & RowDataPacket)[]>(
      `SELECT lab_id 
       FROM labs 
       WHERE ( lab_name = ?)
         AND lab_id <> ?
         AND is_deleted = FALSE`,
      [newData.labcode, newData.lab_name, id]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Lab code or Lab name already exists" });
    }

    const query = `
      UPDATE labs SET 
        labcode = ?,
        lab_name = ?, 
        lab_contact = ?, 
        lab_phone = ?, 
        lab_email = ?, 
        lab_address = ?, 
        lab_city = ?, 
        lab_state = ?, 
        lab_zip = ?, 
        comments = ?,
        updated_by = ?,
        updated_date = NOW()
      WHERE lab_id = ? AND is_deleted = FALSE
    `;

    await mysql.query(query, [
      newData.labcode,
      newData.lab_name,
      newData.lab_contact,
      newData.lab_phone,
      newData.lab_email,
      newData.lab_address,
      newData.lab_city,
      newData.lab_state,
      newData.lab_zip,
      newData.comments,
      user_id,
      id,
    ]);

    await LogController.logUpdate(
      "labs",
      previousData,
      { id, ...newData },
      user_id,
      getSystemIp(req)
    );

    res.json({ message: "Lab updated" });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Lab code or Lab name already exists" });
    }
    await handleError("updating", "labs", err, req.body.user_id, req.ip, {
      stateId: req.params.id,
      ...req.body,
    });
    res.status(500).json({ error: err.message });
  }
};



// ✅ Soft Delete Lab
export const deleteLab = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { user_id } = req.body;
    const id = req.params.id;

    const [oldRows]: any = await mysql.query("SELECT * FROM labs WHERE lab_id = ?", [id]);
    if (!oldRows.length) return res.status(404).json({ message: "Not found" });
    const previousData = oldRows[0];

    await mysql.query("UPDATE labs SET is_deleted=TRUE WHERE lab_id=?", [id]);

        await LogController.logDeletion("labs", { id }, user_id, getSystemIp(req));
    

    res.json({ message: "Lab soft deleted" });
  } catch (err: any) {
    await handleError("deleting", "labs", err, req.body.user_id, getSystemIp(req), {
          stateId: req.params.id,
          ...req.body
        });
    res.status(500).json({ error: err.message });
  }
};
