import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";

// Get DB instance
const db = DatabaseService.getInstance().mysqlConnection;

export const getDrivers = async (req: Request, res: Response) => {
  const ip = getSystemIp(req);
  try {
    const {
      search = "",
      territory = "all",
      page = 1,
      limit = 25
    } = req.query;

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    // Base queries
    let countQuery = `
      SELECT COUNT(*) as total
      FROM users u
      WHERE JSON_CONTAINS(u.role, '"driver"')
        AND u.is_deleted = 0
    `;

    let query = `
      SELECT 
        u.user_id,
        u.first_name,
        u.last_name,
        u.email,
        u.phone,
        t.territory_name,
        u.is_active,
        u.lab_id as user_lab_ids
      FROM users u
      LEFT JOIN territories t ON u.territory = t.territory_id
      WHERE JSON_CONTAINS(u.role, '"driver"')
      AND u.is_deleted = 0
    `;

    const queryParams: any[] = [];
    const countParams: any[] = [];

    // Search filter
    if (search && search.toString().trim() !== "") {
      const condition = ` AND (u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.email LIKE ?)`;
      query += condition;
      countQuery += condition;
      const searchParam = `%${search}%`;
      queryParams.push(searchParam, searchParam, searchParam, searchParam);
      countParams.push(searchParam, searchParam, searchParam, searchParam);
    }

    // Territory filter
    if (territory && territory.toString() !== "all" && territory.toString() !== "") {
      query += ` AND u.territory = ?`;
      countQuery += ` AND u.territory = ?`;
      queryParams.push(parseInt(territory as string));
      countParams.push(parseInt(territory as string));
    }

    // Pagination
    query += ` ORDER BY u.first_name, u.last_name LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit as string), offset);

    // Run queries
    const [countResult]: any = await db.execute(countQuery, countParams);
    const total = countResult[0]?.total || 0;

    const [drivers]: any = await db.execute(query, queryParams);

    // If no drivers found
    if (drivers.length === 0) {
      return res.json({
        success: true,
        data: [],
        pagination: { page, limit, total: 0, pages: 0 }
      });
    }

    // Enhance driver with TSA, routes, and labs
    const enhancedDrivers = await Promise.all(
      drivers.map(async (driver: any) => {
        // --- TSA ---
        const [tsaRow]: any = await db.execute(
          `SELECT tsa_verified, tsaexpiry FROM user_data WHERE user_id = ?`,
          [driver.user_id]
        );
        const tsa = tsaRow[0] || {};

        let tsaStatus = "Not Verified";
        if (tsa.tsa_verified === "1") {
          if (tsa.tsaexpiry && new Date(tsa.tsaexpiry) > new Date()) {
            tsaStatus = "Verified";
          } else {
            tsaStatus = "Expired";
          }
        }

        // --- Routes ---
        const [routes]: any = await db.execute(
          `SELECT route_id, route_name 
           FROM routes 
           WHERE assigned_driver = ? AND is_deleted = 0 AND is_active = 1`,
          [driver.user_id]
        );

        // --- Labs ---
        let labs: any[] = [];
        if (driver.user_lab_ids) {
          try {
            const labIds = JSON.parse(driver.user_lab_ids);
            if (Array.isArray(labIds) && labIds.length > 0) {
              const placeholders = labIds.map(() => "?").join(",");
              const [labData]: any = await db.execute(
                `SELECT lab_id, lab_name, labcode 
                 FROM labs 
                 WHERE lab_id IN (${placeholders})`,
                labIds
              );
              labs = labData;
            }
          } catch (e) {
            console.error("Error parsing lab_ids for driver:", driver.user_id, e);
          }
        }

        return {
          driver_id: driver.user_id,
          driver_name: `${driver.first_name} ${driver.last_name}`.trim(),
          email: driver.email,
          phone: driver.phone,
          territory: driver.territory_name || 'No Territory',
          is_active: driver.is_active,
          tsa_status: tsaStatus,
          tsa_expiry: tsa.tsaexpiry,
          routes,
          labs
        };
      })
    );

    return res.json({
      success: true,
      data: enhancedDrivers,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string))
      }
    });
  } catch (error: any) {
    console.error("Error in getDrivers:", error);
    await handleError("fetching", "driver", error, undefined, ip, req.query);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getTerritories = async (req: Request, res: Response) => {
  try {
    const [territories]: any = await db.execute(
      `SELECT DISTINCT t.territory_id, t.territory_name
       FROM users u
       JOIN territories t ON u.territory = t.territory_id
       WHERE JSON_CONTAINS(u.role, '"driver"')
         AND u.territory IS NOT NULL
       ORDER BY t.territory_name`
    );

    res.json({
      success: true,
      data: territories.map((t: any) => ({
        territory_id: t.territory_id,
        territory_name: t.territory_name,
      })),
    });
  } catch (error: any) {
    await handleError("fetching", "territory", error, undefined, req.ip);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getDriverDocuments = async (req: Request, res: Response) => {
  const ip = getSystemIp(req);

  try {
    const { id } = req.params;

    const [documents]: any = await db.execute(
      `SELECT * FROM driver_documents WHERE driver_id = ?`,
      [id]
    );

    res.json({
      success: true,
      data: documents,
    });
  } catch (error: any) {
    await handleError(
      "fetching",
      "driver_documents",
      error,
      undefined,
      ip,
      { driverId: req.params.id }
    );
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// export const getDriverById = async (req: Request, res: Response) => {
//   try {
//     const { id } = req.params;

//     const query = `
//       SELECT 
//         u.*,
//         ud.*,
//         r.route_name,
//         r.route_id,
//         r.company as route_company,
//         l.lab_id,
//         l.lab_name,
//         l.labcode,
//         (SELECT COUNT(*) FROM driver_documents dd WHERE dd.driver_id = u.user_id) as document_count
//       FROM users u
//       LEFT JOIN user_data ud ON u.user_id = ud.user_id
//       LEFT JOIN routes r ON u.user_id = r.assigned_driver AND r.is_deleted = 0 AND r.is_active = 1
//       LEFT JOIN labs l ON FIND_IN_SET(l.lab_id, REPLACE(REPLACE(REPLACE(u.lab_id, '[', ''), ']', ''), '"', '')) > 0
//       WHERE u.user_id = ? AND u.role = 'driver' AND u.is_deleted = 0
//       GROUP BY u.user_id, l.lab_id
//     `;

//     const [results]: any = await db.execute(query, [id]);

//     if (results.length === 0) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Driver not found" });
//     }

//     // Group labs and format response
//     const driver = results[0];
//     const labs = results
//       .filter((row: any) => row.lab_id)
//       .map((row: any) => ({
//         lab_id: row.lab_id,
//         lab_name: row.lab_name,
//         labcode: row.labcode,
//       }));

//     const formattedDriver = {
//       ...driver,
//       labs: labs,
//       lab_names: labs.map((lab: any) => lab.lab_name).join(", "),
//       tsa_status:
//         driver.tsa_verified === "1"
//           ? driver.tsaexpiry && new Date(driver.tsaexpiry) > new Date()
//             ? "Verified"
//             : "Expired"
//           : "Not Verified",
//     };

//     res.json({
//       success: true,
//       data: formattedDriver,
//     });
//   } catch (error: any) {
//     await handleError("fetching", "driver", error, undefined, req.ip, {
//       driverId: req.params.id,
//     });
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };

/**
 * Update driver status (active/inactive)
 */
// export const updateDriverStatus = async (req: Request, res: Response) => {
//   let connection;
//   try {
//     const { id } = req.params;
//     const { is_active, updated_by } = req.body;
//     const ip = req.ip || req.connection.remoteAddress;

//     if (is_active === undefined || !updated_by) {
//       return res.status(400).json({
//         success: false,
//         message: "is_active and updated_by are required",
//       });
//     }

//     connection = await db.getConnection();

//     // Get previous driver data
//     const [previousDriver]: any = await db.execute(
//       `SELECT * FROM users WHERE user_id = ? AND role = 'driver'`,
//       [id]
//     );

//     if (previousDriver.length === 0) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Driver not found" });
//     }

//     const [result]: any = await db.execute(
//       `UPDATE users SET is_active = ?, updated_by = ?, updated_date = NOW() WHERE user_id = ?`,
//       [is_active, updated_by, id]
//     );

//     if (result.affectedRows === 0) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Driver not found" });
//     }

//     // Log the status update
//     await LogController.logUpdate(
//       "driver",
//       { is_active: previousDriver[0].is_active },
//       { is_active },
//       updated_by,
//       ip
//     );

//     res.json({
//       success: true,
//       message: `Driver ${is_active ? "activated" : "deactivated"} successfully`,
//     });
//   } catch (error: any) {
//     await handleError(
//       "updating",
//       "driver",
//       error,
//       req.body.updated_by,
//       req.ip,
//       {
//         driverId: req.params.id,
//         ...req.body,
//       }
//     );
//     res.status(500).json({ success: false, message: "Internal server error" });
//   } finally {
//     if (connection) connection.release();
//   }
// };



// export const getCompanies = async (req: Request, res: Response) => {
//   try {
//     const [companies]: any = await db.execute(
//       `SELECT DISTINCT company FROM routes WHERE company IS NOT NULL ORDER BY company`
//     );

//     res.json({
//       success: true,
//       data: companies.map((c: any) => c.company),
//     });
//   } catch (error: any) {
//     await handleError("fetching", "company", error, undefined, req.ip);
//     res.status(500).json({ success: false, message: "Internal server error" });
//   }
// };


