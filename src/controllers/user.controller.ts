import { Request, Response } from "express";
import { DatabaseService } from "../config/database.js";
import { LogController } from "./log.controller.js";
import { getSystemIp, handleError } from "../lib/utils.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

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

const generateAccessToken = (user: any) => {
  const payload = {
    id: user.user_id,
    email: user.email,
    fullName: `${user.first_name} ${user.last_name}`,
    role: user.role,
  };
console.log("ACCESS_TOKEN_SECRET:", process.env.ACCESS_TOKEN_SECRET);

  return jwt.sign(
    payload,
    process.env.ACCESS_TOKEN_SECRET as string,
    { expiresIn: (process.env.ACCESS_TOKEN_EXPIRY || "15m") as any }
  );
};

const generateRefreshToken = (user: any) => {
  const payload = {
    id: user.user_id,
    email: user.email,
  };
console.log("ACCESS_TOKEN_SECRET:", process.env.ACCESS_TOKEN_SECRET);
console.log("REFRESH_TOKEN_SECRET:", process.env.REFRESH_TOKEN_SECRET);
  return jwt.sign(
    payload,
    process.env.REFRESH_TOKEN_SECRET as string,
    { expiresIn: (process.env.REFRESH_TOKEN_EXPIRY || "7d") as any }
  );
};

const storeRefreshToken = async (userId: number, token: string, deviceInfo: any = null) => {
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // First, invalidate any existing tokens for this user
  await db.execute(
    "UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = ?",
    [userId]
  );

  // Store the new token with device info
  await db.execute(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, issued_at, device_info) 
     VALUES (?, ?, ?, NOW(), ?)`,
    [userId, tokenHash, expiresAt, JSON.stringify(deviceInfo)]
  );
};

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
//     console.log("🟢 LOG | Actor ID:", actorUserId);
//     const [actorRows]: any = await connection.execute(
//       `SELECT user_id, role FROM users WHERE user_id = ? AND is_deleted = 0`,
//       [actorUserId]
//     );
//     if (!actorRows.length) {
//       return res
//         .status(403)
//         .json({ success: false, message: "Unauthorized user" });
//     }

//    const actorRoleRaw = actorRows[0].role;
// let actorRoles: string[] = [];

// try {
//   actorRoles = JSON.parse(actorRoleRaw); // if stored as JSON string
// } catch {
//   actorRoles = Array.isArray(actorRoleRaw) ? actorRoleRaw : [actorRoleRaw];
// }

// console.log("🟢 LOG | Actor Roles Parsed:", actorRoles);

//     // Only admin or superadmin can update
//     if ((!actorRoles.includes("admin") && !actorRoles.includes("superadmin"))) {
//       return res
//         .status(403)
//         .json({ success: false, message: "You are not allowed to update users" });
//     }

    // -------------------------------
    // Step 2: Validate lab_id(s)
    // -------------------------------
    // console.log("🟢 LOG | Raw lab_id from body:", lab_id);
    // let labIds: number[] = [];
    // if (lab_id) {
    //   if (Array.isArray(lab_id)) {
    //     labIds = lab_id.map((id) => Number(id));
    //   } else if (typeof lab_id === "string") {
    //     try {
    //       labIds = JSON.parse(lab_id).map((id: any) => Number(id));
    //     } catch {
    //       labIds = [Number(lab_id)];
    //     }
    //   }
    // }
    // console.log("🟢 LOG | Parsed labIds:", labIds);

    // if (labIds.length > 0) {
    //   const [validLabs]: any = await connection.execute(
    //     `SELECT lab_id FROM labs WHERE lab_id IN (${labIds
    //       .map(() => "?")
    //       .join(",")}) AND is_deleted = 0`,
    //     labIds
    //   );
    //   console.log("🟢 LOG | Valid labs:", validLabs);

    //   const foundLabIds = validLabs.map((row: any) => row.lab_id);
    //   const invalidIds = labIds.filter((id) => !foundLabIds.includes(id));

    //   if (invalidIds.length > 0) {
    //     return res.status(400).json({
    //       success: false,
    //       message: `Invalid lab_id(s): ${invalidIds.join(", ")}`,
    //     });
    //   }
    // }

    // const labIdsValue = labIds.length > 0 ? JSON.stringify(labIds) : null;
    // console.log("🟢 LOG | labIdsValue for DB:", labIdsValue);

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

      // if (lab_id !== undefined) {
      //   setUserField("lab_id", labIdsValue);
      // }

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

export const loginUser = async (req: Request, res: Response) => {
  const ip = getSystemIp(req);
  const { email, password, deviceInfo } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  try {
    // Get user
    const [users]: any = await db.execute(
      `SELECT user_id, first_name, last_name, email, password, role,
              is_active, is_deleted, phone, time_zone, territory,
              login_attempts, lock_until
       FROM users 
       WHERE email = ? AND is_deleted = 0`,
      [email]
    );

    if (users.length === 0) {
      await LogController.logError("auth", "login", new Error("Invalid email"), undefined, ip, { email });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const user = users[0];

    // Check lock_until (temporary lock)
    if (user.lock_until && new Date(user.lock_until) > new Date()) {
      return res.status(403).json({
        success: false,
        message: "Too many failed attempts. Try again later."
      });
    }

    // Check active status
    if (!user.is_active) {
      await LogController.logError("auth", "login", new Error("Inactive account"), user.user_id, ip, { email });
      return res.status(403).json({ success: false, message: "Account is inactive. Please contact support." });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      const attempts = user.login_attempts + 1;

      if (attempts >= 5) {
        // Lock for 5 minutes
        const lockUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
        await db.execute(
          `UPDATE users SET login_attempts = 0, lock_until = ? WHERE user_id = ?`,
          [lockUntil, user.user_id]
        );
        await LogController.logError("auth", "login", new Error("Too many attempts - locked"), user.user_id, ip, { email });
        return res.status(403).json({
          success: false,
          message: "Too many failed login attempts. Account locked for 5 minutes.",
        });
      } else {
        // Increase attempts
        await db.execute(`UPDATE users SET login_attempts = ? WHERE user_id = ?`, [attempts, user.user_id]);
      }

      await LogController.logError("auth", "login", new Error("Invalid password"), user.user_id, ip, { email });
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // ✅ If login successful, reset attempts + unlock
    await db.execute(
      `UPDATE users SET login_attempts = 0, lock_until = NULL WHERE user_id = ?`,
      [user.user_id]
    );

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    await storeRefreshToken(user.user_id, refreshToken, deviceInfo);

    // Parse role
    let userRole = user.role;
    try {
      if (typeof user.role === "string") {
        userRole = JSON.parse(user.role);
      }
    } catch {
      userRole = [user.role];
    }

    const userResponse = {
      id: user.user_id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: `${user.first_name} ${user.last_name}`,
      role: userRole,
      phone: user.phone,
      time_zone: user.time_zone,
      territory: user.territory,
    };

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    await LogController.createLog({
      action: "auth",
      module: "login",
      userId: user.user_id,
      ip,
      payload: { email: user.email, deviceInfo },
      message: "User logged in successfully",
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      user: userResponse,
      tokens: {
        accessToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || 900,
      },
    });
  } catch (err: any) {
    console.error("Login Error:", err.message);
    await LogController.logError("auth", "login", err, undefined, ip, { email });
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// Refresh token endpoint
export const refreshToken = async (req: Request, res: Response) => {
  const ip = getSystemIp(req);
  
  try {
    // Get refresh token from cookie or body (cookie takes precedence for web)
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required",
      });
    }

    // Verify refresh token
    const decoded: any = jwt.verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET!
    );

    // Check if refresh token exists in database and is not revoked
    const tokenHash = crypto
      .createHash("sha256")
      .update(refreshToken)
      .digest("hex");
    
    const [tokens]: any = await db.execute(
      `SELECT rt.*, u.is_active, u.is_deleted
       FROM refresh_tokens rt 
       JOIN users u ON rt.user_id = u.user_id 
       WHERE rt.token_hash = ? AND rt.is_revoked = FALSE AND rt.expires_at > NOW()`,
      [tokenHash]
    );

    if (tokens.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    const storedToken = tokens[0];

    // Check if user is active and not deleted
    if (storedToken.is_deleted || !storedToken.is_active) {
      return res.status(401).json({
        success: false,
        message: "User account is inactive or deleted",
      });
    }

    // Get user details
    const [users]: any = await db.execute(
      `SELECT user_id, first_name, last_name, email, role 
       FROM users WHERE user_id = ? AND is_deleted = 0 AND is_active = 1`,
      [decoded.id]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
      });
    }

    const user = users[0];

    // Generate new tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Replace old refresh token with new one
    await storeRefreshToken(
      user.user_id,
      newRefreshToken,
      storedToken.device_info ? JSON.parse(storedToken.device_info) : null
    );

    // Set new refresh token as HTTP-only cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Log token refresh
    await LogController.createLog({
      action: "auth",
      module: "login",
      userId: user.user_id,
      ip: ip,
      message: "Access token refreshed successfully"
    });

    // Return response with new access token
    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      tokens: {
        accessToken: newAccessToken,
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || 900,
      },
    });

  } catch (err: any) {
    if (err.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    console.error("Refresh token error:", err);
    
    // Log the error
    await LogController.logError(
      "auth",
      "refresh_token",
      err,
      undefined,
      ip
    );

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Logout controller
export const logoutUser = async (req: Request, res: Response) => {
  const ip = getSystemIp(req);
  const userId = (req as any).user?.user_id;

  try {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.refreshToken;

    // If we have a refresh token, revoke it
    if (refreshToken) {
      const tokenHash = crypto
        .createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      await db.execute(
        "UPDATE refresh_tokens SET is_revoked = TRUE WHERE user_id = ? AND token_hash = ?",
        [userId, tokenHash]
      );
    }

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    // Log the logout
    await LogController.createLog({
      action: "auth",
      module: "logout",
      userId: userId,
      ip: ip,
      message: "User logged out successfully"
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (err: any) {
    console.error("Logout error:", err);
    
    // Log the error
    await LogController.logError(
      "auth",
      "logout",
      err,
      userId,
      ip
    );

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};
