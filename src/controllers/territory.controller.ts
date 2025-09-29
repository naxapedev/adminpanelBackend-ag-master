import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import Log from "../models/mongodb/logModel.js";
import {  ResultSetHeader, RowDataPacket } from "mysql2";
import { Territory } from "../types/index.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";

export const createTerritory = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { data, user_id } = req.body;

    // 🔎 Check if territory_name or territory_code already exists
    const [dupRows] = await mysql.query<(Territory & RowDataPacket)[]>(
      `SELECT territory_id 
       FROM territories 
       WHERE (territory_name = ? OR territory_code = ?)
         AND is_deleted = FALSE`,
      [data.territory_name, data.territory_code]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Territory name or code already exists" });
    }

    const query = `
      INSERT INTO territories 
      (territory_name, territory_code, manager_name, manager_phone, manager_email,
       contractor_name, contractor_phone, contractor_email, comments, state_id, created_by, created_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await mysql.query<ResultSetHeader>(query, [
      data.territory_name,
      data.territory_code,
      data.manager_name,
      data.manager_phone,
      data.manager_email,
      data.contractor_name,
      data.contractor_phone,
      data.contractor_email,
      data.comments,
      data.state_id || null,
      user_id || null
    ]);

    await LogController.logCreation("territories", data, user_id, getSystemIp(req));

    res.status(201).json({ message: "Territory created", territory_id: result.insertId });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Territory name or code already exists" });
    }
    await handleError("creating", "territories", err, req.body.user_id, req.ip, req.body);
    res.status(500).json({ error: err.message });
  }
};


export const getAllTerritories = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<Territory[]>(
      `SELECT 
        territory_id,
        territory_name,
        manager_name,
        territory_code,
        is_active,
        is_deleted
      FROM territories
      WHERE is_deleted = FALSE`
    );

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
export const getAllTerritoriesForDropdown = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<Territory[]>(
      `SELECT 
        territory_id,
        territory_name
      FROM territories
      WHERE is_deleted = FALSE AND is_active = TRUE`
    );

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


export const getTerritoryById = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<Territory[]>(
      `SELECT 
        territory_id,
        territory_name,
        territory_code,
        manager_name,
        manager_phone,
        manager_email,
        contractor_name,
        contractor_phone,
        contractor_email,
        comments,
        state_id
      FROM territories 
      WHERE territory_id = ? AND is_deleted = FALSE`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ message: "Not found" });

    res.json(rows[0]);
  } catch (err: any) {
    
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get territories by state_id
export const getTerritoriesByStateId = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const stateId = req.params.state_id; // <-- from URL params

    const [rows] = await mysql.query<(Territory & RowDataPacket)[]>(
      `SELECT 
        territory_id,
        territory_name
      FROM territories 
      WHERE state_id = ? AND is_deleted = 0 AND is_active = 1`,
      [stateId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No territories found for this state" });
    }

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};




export const updateTerritory = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const id = req.params.id;
    const { newData, user_id } = req.body;

    // check if record exists
    const [oldRows] = await mysql.query<(Territory & RowDataPacket)[]>(
      "SELECT * FROM territories WHERE territory_id = ? AND is_deleted = FALSE",
      [id]
    );
    if (!oldRows.length) {
      return res.status(404).json({ message: "Not found" });
    }
    const previousData = oldRows[0];

    // 🔎 Check if territory_name or territory_code already exists (excluding current record)
    const [dupRows] = await mysql.query<(Territory & RowDataPacket)[]>(
      `SELECT territory_id 
       FROM territories 
       WHERE (territory_name = ? OR territory_code = ?)
         AND territory_id <> ?
         AND is_deleted = FALSE`,
      [newData.territory_name, newData.territory_code, id]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Territory name or code already exists" });
    }

    const query = `
      UPDATE territories SET 
        territory_name = ?, 
        territory_code = ?, 
        state_id = ?, 
        is_active = ?, 
        manager_name = ?, 
        manager_phone = ?, 
        manager_email = ?, 
        contractor_name = ?, 
        contractor_phone = ?, 
        contractor_email = ?, 
        comments = ?,
        updated_by = ?,
        updated_date = NOW()
      WHERE territory_id = ? AND is_deleted = FALSE
    `;

    await mysql.query(query, [
      newData.territory_name,
      newData.territory_code,
      newData.state_id,
      newData.is_active,
      newData.manager_name,
      newData.manager_phone,
      newData.manager_email,
      newData.contractor_name,
      newData.contractor_phone,
      newData.contractor_email,
      newData.comments,
      user_id,
      id,
    ]);

    await LogController.logUpdate(
      "territories",
      previousData,
      { id, ...newData },
      user_id,
      getSystemIp(req)
    );

    res.json({ message: "Territory updated" });
  } catch (err: any) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ error: "Territory name or code already exists" });
    }
    await handleError("updating", "territories", err, req.body.user_id, req.ip, {
      stateId: req.params.id,
      ...req.body,
    });
    res.status(500).json({ error: err.message });
  }
};



export const deleteTerritory = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { user_id } = req.body;
    const id = req.params.id;

    const [oldRows] = await mysql.query<Territory[]>(
      "SELECT * FROM territories WHERE territory_id = ? AND is_deleted = FALSE",
      [id]
    );
    if (!oldRows.length) return res.status(404).json({ message: "Not found" });
    const previousData = oldRows[0];

    await mysql.query("UPDATE territories SET is_deleted=TRUE, WHERE territory_id=?", [id]);


    await LogController.logDeletion("territories", { id }, user_id, getSystemIp(req));

    res.json({ message: "Territory soft deleted" });
  } catch (err: any) {
     await handleError("deleting", "territories", err, req.body.user_id, getSystemIp(req), {
      stateId: req.params.id,
      ...req.body
    });
    res.status(500).json({ error: err.message });
  }
};
