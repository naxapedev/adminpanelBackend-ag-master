import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";
import bcrypt from "bcryptjs";
// Get DB instance
const db = DatabaseService.getInstance().mysqlConnection;

// Define user roles
export const USER_ROLES = {
  SUPER_ADMIN: "superadmin",
  ADMIN: "admin",
  DRIVER: "driver",
  DISPATCHER: "dispatcher",
  MANAGER: "manager",
} as const;

export const createUser = async (req: Request, res: Response) => {
  let connection;
  const ip = getSystemIp(req);

  try {
    const {
      first_name, last_name, email, phone, time_zone, role, territory, password, lab_id, created_by, is_active = 1,
      email2, scndPhone, address1, city, state1, zip, ship_address1, ship_address2, ship_city, ship_state, ship_zip,
      nickName, ssn, DOB, emp_type, hire_date, term_date, emergency_name, emergency_phone, relationship, comment
    } = req.body;

    const rolesValue = role ? JSON.stringify(Array.isArray(role) ? role : [role]) : null;
    const labIdsValue = lab_id ? JSON.stringify(Array.isArray(lab_id) ? lab_id : [lab_id]) : null;

    const saltRounds = 10;
    const hashedPassword = password ? await bcrypt.hash(password, saltRounds) : null;

    connection = await db.getConnection();
    await connection.beginTransaction();

    try {
      // Insert into users
      const [result]: any = await connection.execute(
        `INSERT INTO users (
          first_name, last_name, email, phone, time_zone, role, territory, 
          password, lab_id, created_by, updated_by, created_date, updated_date, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), ?)`,
        [ first_name || null, last_name || null, email || null, phone || null, time_zone || null, rolesValue, territory || null, hashedPassword, labIdsValue, created_by || null, created_by || null, is_active ?? 1,]
      );

      const userId = result.insertId;

      // Insert into user_data
      await connection.execute(
        `INSERT INTO user_data (
          user_id, email, email2, scndPhone, address1, city, state1, zip,
          ship_address1, ship_address2, ship_city, ship_state, ship_zip,
          nickName, ssn, DOB, emp_type, hire_date, term_date,
          emergency_name, emergency_phone, relationship, comment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ userId.toString(), email || null, email2 || null, scndPhone || null, address1 || null, city || null, state1 || null, zip || null, ship_address1 || null, ship_address2 || null, ship_city || null, ship_state || null, ship_zip || null, nickName || null, ssn || null, DOB || null, emp_type || null, hire_date || null, term_date || null, emergency_name || null, emergency_phone || null, relationship || null, comment || null,]
      );

      await connection.commit();

      res.status(201).json({
        success: true,
        message: "User created successfully",
        data: { user_id: userId },
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    await handleError("creating", "users", error, req.body?.created_by, ip, req.body);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};


export const updateUser = async (req: Request, res: Response) => {
  let connection;
  const ip = getSystemIp(req);

  // helper → convert undefined → null
  const safe = (val: any) => (val === undefined ? null : val);

  try {
    const { user_id } = req.params;
    const {
      // users table
      first_name, last_name, email, phone, time_zone, role, territory, password, lab_id, is_active, is_agreed, actorUserId,

      // user_data table
      email2, scndPhone, address1, city, state1, zip, ship_address1, ship_address2, ship_city, ship_state, ship_zip, nickName, ssn, DOB, emp_type, hire_date, term_date, emergency_name, emergency_phone, relationship, comment,
    } = req.body;

    connection = await db.getConnection();

    // -------------------------------
    // Step 1: Verify actor
    // -------------------------------
    console.log("🟢 LOG | Actor ID:", actorUserId);
    const [actorRows]: any = await connection.execute(
      `SELECT user_id, role FROM users WHERE user_id = ? AND is_deleted = 0`,
      [actorUserId]
    );
    if (!actorRows.length) {
      return res
        .status(403)
        .json({ success: false, message: "Unauthorized user" });
    }

    const actorRole = actorRows[0].role;
    console.log("🟢 LOG | Actor Role:", actorRole);

    // Only admin or superadmin can update
    if (actorRole !== "admin" && actorRole !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, message: "You are not allowed to update users" });
    }

    // -------------------------------
    // Step 2: Validate lab_id(s)
    // -------------------------------
    console.log("🟢 LOG | Raw lab_id from body:", lab_id);
    let labIds: number[] = [];
    if (lab_id) {
      if (Array.isArray(lab_id)) {
        labIds = lab_id.map((id) => Number(id));
      } else if (typeof lab_id === "string") {
        try {
          labIds = JSON.parse(lab_id).map((id: any) => Number(id));
        } catch {
          labIds = [Number(lab_id)];
        }
      }
    }
    console.log("🟢 LOG | Parsed labIds:", labIds);

    if (labIds.length > 0) {
      const [validLabs]: any = await connection.execute(
        `SELECT lab_id FROM labs WHERE lab_id IN (${labIds
          .map(() => "?")
          .join(",")}) AND is_deleted = 0`,
        labIds
      );
      console.log("🟢 LOG | Valid labs:", validLabs);

      const foundLabIds = validLabs.map((row: any) => row.lab_id);
      const invalidIds = labIds.filter((id) => !foundLabIds.includes(id));

      if (invalidIds.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Invalid lab_id(s): ${invalidIds.join(", ")}`,
        });
      }
    }

    const labIdsValue = labIds.length > 0 ? JSON.stringify(labIds) : null;
    console.log("🟢 LOG | labIdsValue for DB:", labIdsValue);

    // -------------------------------
    // Step 3: Hash password if provided
    // -------------------------------
    let hashedPassword: string | undefined;
    if (password) {
      hashedPassword = await bcrypt.hash(password, 10);
      console.log("🟢 LOG | Password hashed");
    }

    // -------------------------------
    // Step 4: Begin transaction
    // -------------------------------
    await connection.beginTransaction();

    try {
      // -------------------------------
      // Update users table
      // -------------------------------
      const usersUpdates: string[] = [];
      const usersValues: any[] = [];

      const setUserField = (column: string, value: any) => {
        if (value !== undefined) {
          usersUpdates.push(`${column} = ?`);
          usersValues.push(safe(value));
        }
      };

      setUserField("first_name", first_name);
      setUserField("last_name", last_name);
      setUserField("email", email);
      setUserField("phone", phone);
      setUserField("time_zone", time_zone);
      setUserField("territory", territory);
      setUserField("is_active", is_active);
      setUserField("is_agreed", is_agreed);

      if (role !== undefined) {
        const rolesArray = Array.isArray(role) ? role : [role];
        setUserField("role", JSON.stringify(rolesArray));
      }

      if (lab_id !== undefined) {
        setUserField("lab_id", labIdsValue);
      }

      if (hashedPassword) {
        setUserField("password", hashedPassword);
      }

      setUserField("updated_by", actorUserId);
      usersUpdates.push("updated_date = NOW()");

      if (usersUpdates.length) {
        const sql = `UPDATE users SET ${usersUpdates.join(
          ", "
        )} WHERE user_id = ?`;
        usersValues.push(user_id);

        console.log("🟢 LOG | Users SQL:", sql);
        console.log("🟢 LOG | Users Params:", usersValues);

        await connection.execute(sql, usersValues);
      }

      // -------------------------------
      // Update user_data table
      // -------------------------------
      const userDataUpdates: string[] = [];
      const userDataValues: any[] = [];

      const setUserDataField = (column: string, value: any) => {
        if (value !== undefined) {
          userDataUpdates.push(`${column} = ?`);
          userDataValues.push(safe(value));
        }
      };

      setUserDataField("email2", email2);
      setUserDataField("scndPhone", scndPhone);
      setUserDataField("address1", address1);
      setUserDataField("city", city);
      setUserDataField("state1", state1);
      setUserDataField("zip", zip);
      setUserDataField("ship_address1", ship_address1);
      setUserDataField("ship_address2", ship_address2);
      setUserDataField("ship_city", ship_city);
      setUserDataField("ship_state", ship_state);
      setUserDataField("ship_zip", ship_zip);
      setUserDataField("nickName", nickName);
      setUserDataField("ssn", ssn);
      setUserDataField("DOB", DOB);
      setUserDataField("emp_type", emp_type);
      setUserDataField("hire_date", hire_date);
      setUserDataField("term_date", term_date);
      setUserDataField("emergency_name", emergency_name);
      setUserDataField("emergency_phone", emergency_phone);
      setUserDataField("relationship", relationship);
      setUserDataField("comment", comment);

      if (userDataUpdates.length) {
        const sql = `UPDATE user_data 
               SET ${userDataUpdates.join(", ")} 
               WHERE user_id = ?`;

        userDataValues.push(safe(user_id));

        console.log("🟢 LOG | UserData SQL:", sql);
        console.log("🟢 LOG | UserData Params:", userDataValues);

        await connection.execute(sql, userDataValues);
      }

      // Commit transaction
      await connection.commit();

      // -------------------------------
      // Step 5: Fetch updated record
      // -------------------------------
      const [updatedRows]: any = await connection.execute(
        `SELECT u.*, ud.email2, ud.scndPhone, ud.address1, ud.city, ud.state1, ud.zip,
                ud.ship_address1, ud.ship_address2, ud.ship_city, ud.ship_state, ud.ship_zip,
                ud.nickName, ud.ssn, ud.DOB, ud.emp_type, ud.hire_date, ud.term_date,
                ud.emergency_name, ud.emergency_phone, ud.relationship, ud.comment
         FROM users u
         LEFT JOIN user_data ud ON u.user_id = ud.user_id
         WHERE u.user_id = ?`,
        [user_id]
      );

      const updatedUser = updatedRows[0];
      updatedUser.lab_id = updatedUser.lab_id
        ? JSON.parse(updatedUser.lab_id)
        : [];
      updatedUser.role = updatedUser.role
        ? JSON.parse(updatedUser.role)
        : [];

      // -------------------------------
      // Step 6: Log update
      // -------------------------------
      await LogController.logUpdate(
        "users",
        {}, // can pass previousUser if you load it
        updatedUser,
        actorUserId,
        ip
      );

      res.json({ success: true, message: "User updated successfully", data: updatedUser,});
    } catch (err) {
      await connection.rollback();
      throw err;
    }
  } catch (error: any) {
    console.error("❌ Error in updateUser:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};


export const deleteUser = async (req: Request, res: Response) => {
  let connection;
  const ip = getSystemIp(req);
  try {
    const { user_id } = req.params;

    connection = await db.getConnection();
    const [userRows]: any = await db.execute(`SELECT * FROM users WHERE user_id = ? AND is_deleted = 0`,[user_id]);

    if (userRows.length === 0) {return res.status(404).json({ success: false, message: "User not found" });}
    const userToDelete = userRows[0];

    // Perform soft delete.
    const [result]: any = await db.execute(`UPDATE users SET is_deleted = 1, updated_date = NOW() WHERE user_id = ?`,[user_id]);
    if (result.affectedRows === 0) {return res.status(404).json({ success: false, message: "User not found" });}

    if (userToDelete.lab_id) {
      try {
        userToDelete.lab_id = JSON.parse(userToDelete.lab_id);
      } catch {
        userToDelete.lab_id = [userToDelete.lab_id];
      }
    } else {
      userToDelete.lab_id = [];
    }

    // Log the deletion action (you can still log with user_id only)
    await LogController.logDeletion("users", userToDelete, Number(user_id), ip);

    res.json({success: true,message: "User deleted successfully (soft delete)",data: userToDelete,});
  } catch (error: any) {
    await handleError("deleting","users",error,Number(req.params.user_id),req.ip,{ userId: req.params.user_id });
    res.status(500).json({ success: false, message: "Internal server error" });
  } finally {
    if (connection) connection.release();
  }
};


export const getUsers = async (req: Request, res: Response) => {
  const ip = getSystemIp(req);

  try {
    // console.log("👉 Incoming query params:", req.query);

    const {
      role,
      is_active,
      is_deleted = 0,
      territory,
      lab_id,
      search,
    } = req.query;

    let query = `
      SELECT 
        user_id, first_name, last_name, phone, email, role, time_zone, lab_id, is_active
      FROM users
      WHERE is_deleted = ?
    `;
    const params: any[] = [is_deleted];

    // Optional filters
    if (role) {
      query += ` AND JSON_CONTAINS(role, ?)`;
      params.push(`"${role}"`); // wrap in quotes for JSON string
      console.log("🔹 Adding role filter:", role);
    }

    if (is_active !== undefined) {
      query += ` AND is_active = ?`;
      params.push(is_active);
      console.log("🔹 Adding is_active filter:", is_active);
    }

    if (territory) {
      query += ` AND territory = ?`;
      params.push(territory);
      console.log("🔹 Adding territory filter:", territory);
    }

    if (lab_id) {
      // Remove brackets if client sent [1,2,3]
      const labIds = lab_id
        .toString()
        .replace(/[\[\]\s]/g, "")
        .split(","); // ["1","2","3"]

      const conditions = labIds
        .map(() => "JSON_CONTAINS(lab_id, ?)")
        .join(" OR ");
      query += ` AND (${conditions})`;

      // Pass numbers (no quotes)
      params.push(...labIds.map((id) => id));
    }

    // Add search support
    if (search) {
      query += ` AND (
        first_name LIKE ? OR
        last_name LIKE ? OR
        phone LIKE ? OR
        email LIKE ?
      )`;
      const likeSearch = `%${search}%`;
      params.push(likeSearch, likeSearch, likeSearch, likeSearch);
      console.log("🔹 Adding search filter:", search);
    }

    query += ` ORDER BY first_name, last_name ASC`;

    // console.log("👉 Final SQL query:", query);
    // console.log("👉 Query params:", params);

    const [users]: any = await db.execute(query, params);
    // console.log("✅ Users fetched:", users.length);

    // Fetch labs and map lab_id -> lab_name
    const [labs]: any = await db.execute(
      `SELECT lab_id, lab_name FROM labs WHERE is_deleted = 0`
    );
    // console.log("✅ Labs fetched:", labs.length);

    const labMap: Record<string, string> = {};
    labs.forEach((lab: any) => {
      labMap[lab.lab_id] = lab.lab_name;
    });
    // console.log("🔹 Lab map:", labMap);

    const usersWithLabs = users.map((user: any) => {
      if (user.lab_id) {
      try {
        const parsed = JSON.parse(user.lab_id);

        if (Array.isArray(parsed)) {
          user.labs = parsed.map((id: string | number) => labMap[id] || id);
        } else {
          user.labs = [labMap[parsed] || parsed];
        }
      } catch (err) {
        console.error("❌ Error parsing lab_id for user:", user.user_id, err);
        user.labs = [labMap[user.lab_id] || user.lab_id];
      }
      } else {
        user.labs = [];
      }
      delete user.lab_id;
      return user;
    });

    // console.log("✅ Users processed with labs");

    res.json({
      success: true,
      data: usersWithLabs,
      count: usersWithLabs.length,
    });
  } catch (error: any) {
    console.error("❌ Error in getUsers:", error.message, error.stack);
    await handleError(
      "fetching",
      "user",
      error,
      req.body.user_id,
      ip,
      req.query
    );
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Fetch from users
    const [userRows]: any = await db.execute(
      `SELECT * FROM users WHERE user_id = ? AND is_deleted = 0`,
      [id]
    );

    if (userRows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const user = userRows[0];

    // Fetch from user_data
    const [userDataRows]: any = await db.execute(
      `SELECT * FROM user_data WHERE user_id = ?`,
      [id]
    );

    const userData = userDataRows.length > 0 ? userDataRows[0] : {};

    // Parse lab_id into array
    let labIds: number[] = [];
    if (user.lab_id) {
      try {
        labIds = JSON.parse(user.lab_id);
        if (!Array.isArray(labIds)) {
          labIds = [labIds];
        }
      } catch {
        labIds = [user.lab_id];
      }
    }

    // Fetch lab details if labIds exist
    let labs: any[] = [];
    if (labIds.length > 0) {
      const [labRows]: any = await db.query(
        `SELECT lab_id, lab_name
         FROM labs 
         WHERE lab_id IN (${labIds.map(() => "?").join(",")}) AND is_deleted = 0`,
        labIds
      );
      labs = labRows;
    }

    // Merge everything
    const fullUser = {
      ...user,
      ...userData,
      labs, // resolved labs info
    };

    res.json({
      success: true,
      data: fullUser,
    });
  } catch (error: any) {
    await handleError("fetching", "user", error, req.body.user_id, req.ip, {
      userId: req.params.id,
    });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
