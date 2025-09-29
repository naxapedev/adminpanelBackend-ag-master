import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { RowDataPacket, ResultSetHeader } from "mysql2";
import LogController from "./log.controller.js";
import { handleError } from "../lib/utils.js";
import { Route } from "../types/index.js";

// helper to extract IP
function getSystemIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string) ||
    req.socket.remoteAddress ||
    ""
  );
}

// ✅ Create Route
export const createRoute = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { data, user_id } = req.body;

    // 🔎 Duplicate check (route_name inside same territory)
    const [dupRows] = await mysql.query<(Route & RowDataPacket)[]>(
      `SELECT route_id 
       FROM routes 
       WHERE route_name = ? 
         AND territory_id = ? 
         AND is_deleted = FALSE`,
      [data.route_name, data.territory_id]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Route name already exists in this territory" });
    }

    const query = `
      INSERT INTO routes
      (territory_id, route_name, day_week, comments, clinic, assigned_driver, delivery_id, lab_id,
       assigned_at, created_by, is_temporary, temp_day, is_active, on_demand, created_date, is_deleted )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,  NOW(), 0)
    `;

    const [result] = await mysql.query<ResultSetHeader>(query, [
      data.territory_id,
      data.route_name,
      JSON.stringify(data.day_week),
      data.comments,
      JSON.stringify(data.clinic),
      data.assigned_driver,
      data.delivery_id,
      data.lab_id,
      data.assigned_at,
      user_id,
      data.is_temporary,
      data.temp_day,
      data.is_active,
      data.on_demand,
    ]);

    await LogController.logCreation("routes", data, user_id, getSystemIp(req));

    res.status(201).json({ message: "Route created", route_id: (result as ResultSetHeader).insertId });
  } catch (err: any) {
    await handleError("creating", "routes", err, req.body.user_id, req.ip, req.body);
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get All Routes (summary)
export const getAllRoutes = async (_req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const [rows] = await mysql.query<(Route & RowDataPacket)[]>(
      `SELECT 
         r.route_id,
         r.route_name,
         r.day_week,
         r.is_active,
         l.lab_name,
         t.territory_name,
         CONCAT(u.first_name, ' ', u.last_name) AS driver_name
       FROM routes r
       LEFT JOIN labs l ON r.lab_id = l.lab_id
       LEFT JOIN territories t ON r.territory_id = t.territory_id
       LEFT JOIN users u ON r.assigned_driver = u.user_id
       WHERE r.is_deleted = FALSE`
    );

    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get Route by ID (all details)
export const getRouteById = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { id } = req.params;

    const [rows] = await mysql.query<(Route & RowDataPacket)[]>(
      `SELECT 
         r.*,
         l.lab_name,
         t.territory_name,
         CONCAT(u.first_name, ' ', u.last_name) AS driver_name
       FROM routes r
       LEFT JOIN labs l ON r.lab_id = l.lab_id
       LEFT JOIN territories t ON r.territory_id = t.territory_id
       LEFT JOIN users u ON r.assigned_driver = u.user_id
       WHERE r.route_id = ? AND r.is_deleted = FALSE`,
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: "Not found" });

    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update Route
export const updateRoute = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const { id } = req.params;
    const { newData, user_id } = req.body;

    // check if exists
    const [oldRows] = await mysql.query<(Route & RowDataPacket)[]>(
      "SELECT * FROM routes WHERE route_id = ? AND is_deleted = FALSE",
      [id]
    );
    if (!oldRows.length) {
      return res.status(404).json({ message: "Not found" });
    }
    const previousData = oldRows[0];

    // duplicate check
    const [dupRows] = await mysql.query<(Route & RowDataPacket)[]>(
      `SELECT route_id 
       FROM routes 
       WHERE route_name = ? 
         AND territory_id = ? 
         AND route_id <> ?
         AND is_deleted = FALSE`,
      [newData.route_name, newData.territory_id, id]
    );

    if ((dupRows as any[]).length > 0) {
      return res.status(400).json({ error: "Route name already exists in this territory" });
    }

    const query = `
      UPDATE routes SET
        territory_id = ?,
        route_name = ?,
        day_week = ?,
        comments = ?,
        clinic = ?,
        assigned_driver = ?,
        delivery_id = ?,
        lab_id = ?,
        assigned_at = ?,
        updated_by = ?,
        updated_date = NOW(),
        is_temporary = ?,
        temp_day = ?,
        is_active = ?,
        on_demand = ?
      WHERE route_id = ? AND is_deleted = FALSE
    `;

    await mysql.query(query, [
      newData.territory_id,
      newData.route_name,
      JSON.stringify(newData.day_week),
      newData.comments,
      JSON.stringify(newData.clinic),
      newData.assigned_driver,
      newData.delivery_id,
      newData.lab_id,
      newData.assigned_at,
      user_id,
      newData.is_temporary,
      newData.temp_day,
      newData.is_active,
      newData.on_demand,
      id,
    ]);

    await LogController.logUpdate("routes", previousData, { id, ...newData }, user_id, getSystemIp(req));

    res.json({ message: "Route updated" });
  } catch (err: any) {
    await handleError("updating", "routes", err, req.body.user_id, req.ip, {
      routeId: req.params.id,
      ...req.body,
    });
    res.status(500).json({ error: err.message });
  }
};

// ✅ Soft Delete Route
export const deleteRoute = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;
    const { user_id } = req.body;
    const { id } = req.params;

    const [oldRows]: any = await mysql.query("SELECT * FROM routes WHERE route_id = ?", [id]);
    if (!oldRows.length) return res.status(404).json({ message: "Not found" });
    const previousData = oldRows[0];

    await mysql.query("UPDATE routes SET is_deleted=TRUE WHERE route_id=?", [id]);

    await LogController.logDeletion("routes", { id }, user_id, getSystemIp(req));

    res.json({ message: "Route soft deleted" });
  } catch (err: any) {
    await handleError("deleting", "routes", err, req.body.user_id, getSystemIp(req), {
      routeId: req.params.id,
      ...req.body,
    });
    res.status(500).json({ error: err.message });
  }
};


export const getRouteDetailsForDriverChangeById = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const { id } = req.params;

    const [rows] = await mysql.query<(RowDataPacket)[]>(`
      SELECT 
        r.is_temporary,
        r.temp_day,
        r.assigned_driver
      FROM routes r
      WHERE r.is_deleted = 0 
        AND r.route_id = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Route not found" });
    }

    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};


// ✅ Update Route Details (is_temporary, temp_day, assigned_driver only)
export const updateRouteDriver = async (req: Request, res: Response) => {
  try {
    const db = DatabaseService.getInstance();
    const mysql = db.mysqlConnection;

    const { id } = req.params;
    const { newData, user_id } = req.body;

    // check if exists
    const [oldRows] = await mysql.query<(Route & RowDataPacket)[]>(
      "SELECT * FROM routes WHERE route_id = ? AND is_deleted = FALSE",
      [id]
    );
    if (!oldRows.length) {
      return res.status(404).json({ message: "Not found" });
    }
    const previousData = oldRows[0];

    // ✅ No duplicate check needed here (not renaming / territory update)

    const query = `
      UPDATE routes SET
        is_temporary = ?,
        temp_day = ?,
        assigned_driver = ?,
        updated_by = ?,
        updated_date = NOW()
      WHERE route_id = ? AND is_deleted = FALSE
    `;

    await mysql.query(query, [
      newData.is_temporary,
      newData.temp_day,
      newData.assigned_driver,
      user_id,
      id,
    ]);

    // ✅ Log update
    await LogController.logUpdate(
      "routes",
      previousData,
      { id, ...newData },
      user_id,
      getSystemIp(req)
    );

    res.json({ message: "Route details updated" });
  } catch (err: any) {
    await handleError("updating", "routes", err, req.body.user_id, req.ip, {
      routeId: req.params.id,
      ...req.body,
    });
    res.status(500).json({ error: err.message });
  }
};
