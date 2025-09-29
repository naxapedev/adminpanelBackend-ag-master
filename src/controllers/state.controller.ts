import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";
import { RowDataPacket } from "mysql2";

// Get DB instance
const db = DatabaseService.getInstance().mysqlConnection;

/**
 * Create a new state
 */
export const createState = async (req: Request, res: Response) => {
  let connection;
  try {
    const { state_name, state_code, user_id, is_active } = req.body;
    const ip = getSystemIp(req);

    if (!state_name || !user_id) {
      return res.status(400).json({ success: false, message: "state_name and user_id are required" });
    }

    connection = await db.getConnection();

    // 🔍 Check for duplicate state
    const [duplicateRows]: any = await db.execute(
      `SELECT * FROM states WHERE state_name = ? OR state_code = ?`,
      [state_name, state_code]
    );

    if (duplicateRows.length > 0) {
      return res.status(400).json({ success: false, message: "State with same name or code already exists" });
    }

    const [result]: any = await db.execute(
      `INSERT INTO states (state_name, state_code, created_by, created_date, is_deleted, is_active) 
       VALUES (?, ?, ?, NOW(), 0, 1)`,
      [state_name, state_code || null, user_id]
    );

    const newState = {
      state_id: result.insertId,
      state_name,
      state_code,
      user_id,
      created_date: new Date(),
      is_deleted: 0,
      is_active
    };

    // Log the creation action
    await LogController.logCreation("state", newState, user_id, ip);

    res.status(201).json({
      success: true,
      message: "State created successfully"
    });
  } catch (error: any) {
    await handleError("creating", "state", error, req.body.user_id, req.ip, req.body);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Update an existing state
 */
export const updateState = async (req: Request, res: Response) => {
  let connection;
  try {
    const { id } = req.params;
    const { state_name, state_code, user_id, is_active, is_deleted } = req.body;
    const ip = getSystemIp(req);

    if (!user_id) {
      return res.status(400).json({ success: false, message: "updated_by is required" });
    }

    connection = await db.getConnection();

    // Get previous state data
    const [previousStateRows]: any = await db.execute(
      `SELECT * FROM states WHERE state_id = ?`,
      [id]
    );

    if (previousStateRows.length === 0) {
      return res.status(404).json({ success: false, message: "State not found" });
    }

    const previousState = previousStateRows[0];

    // 🔍 Check for duplicate name/code (excluding current record)
    if (state_name || state_code) {
      const [duplicateRows]: any = await db.execute(
        `SELECT * FROM states 
         WHERE (state_name = ? OR state_code = ?) 
         AND state_id != ?`,
        [state_name || previousState.state_name, state_code || previousState.state_code, id]
      );

      if (duplicateRows.length > 0) {
        return res.status(400).json({ success: false, message: "Another state with same name or code already exists" });
      }
    }

    const [result]: any = await db.execute(
      `UPDATE states 
       SET state_name = ?, state_code = ?, updated_by = ?, updated_date = NOW(), is_active = ?, is_deleted = ?
       WHERE state_id = ?`,
      [
        state_name || previousState.state_name,
        state_code || previousState.state_code,
        user_id,
        is_active ?? previousState.is_active,
        is_deleted ?? previousState.is_deleted,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "State not found" });
    }

    // Get updated state data
    const [updatedStateRows]: any = await db.execute(
      `SELECT * FROM states WHERE state_id = ?`,
      [id]
    );

    const updatedState = updatedStateRows[0];

    // Log the update action
    await LogController.logUpdate("state", previousState, updatedState, user_id, ip);

    res.json({
      success: true,
      message: "State updated successfully"
    });
  } catch (error: any) {
    await handleError("updating", "state", error, req.body.user_id, req.ip, {
      stateId: req.params.id,
      ...req.body
    });
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Delete a state (soft delete: set is_deleted = 1)
 */
export const deleteState = async (req: Request, res: Response) => {
  let connection;
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    if (!user_id) {
      return res.status(400).json({ success: false, message: "user_id is required" });
    }

    connection = await db.getConnection();

    // Get state data before deletion
    const [stateRows]: any = await db.execute(
      `SELECT * FROM states WHERE state_id = ?`,
      [id]
    );

    if (stateRows.length === 0) {
      return res.status(404).json({ success: false, message: "State not found" });
    }

    const stateToDelete = stateRows[0];

    const [result]: any = await db.execute(
      `UPDATE states SET is_deleted = 1, updated_by = ?, updated_date = NOW() WHERE state_id = ?`,
      [user_id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "State not found" });
    }

    // Log the deletion action
    await LogController.logDeletion("state", stateToDelete, user_id, ip);

    res.json({ 
      success: true, 
      message: "State deleted successfully (soft delete)",
      data: stateToDelete
    });
  } catch (error: any) {
    await handleError("deleting", "state", error, req.body.user_id, req.ip, {
      stateId: req.params.id,
      ...req.body
    });
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Get all states with optional filters
 */
export const getStates = async (req: Request, res: Response) => {
  try {
    const { is_active, is_deleted } = req.query;

    let query = `SELECT * FROM states WHERE 1=1`;
    const params: any[] = [];

    if (is_active !== undefined) {
      query += ` AND is_active = ?`;
      params.push(is_active);
    }

    if (is_deleted !== undefined) {
      query += ` AND is_deleted = ?`;
      params.push(is_deleted);
    }

    query += ` ORDER BY state_name ASC`;

    const [states]: any = await db.execute(query, params);

    res.json({ 
      success: true, 
      data: states,
      count: states.length
    });
  } catch (error: any) {
    await handleError("fetching", "state", error, undefined, req.ip, req.query);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};


export const getActiveStates = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<{ state_id: number; state_name: string } & RowDataPacket[]>(
      `SELECT 
        state_id,
        state_name
      FROM states
      WHERE is_deleted = FALSE AND is_active = TRUE`
    );

    if (!rows.length) {
      return res.status(404).json({ message: "No active states found" });
    }

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};