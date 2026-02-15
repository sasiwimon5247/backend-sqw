const db = require("../config/db");
const fs = require('fs');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// ================= SIGNUP (1 Email : 1 Role Version) =================
exports.signup = async (req, res) => {
    let payload;
    const files = req.files || {};

    try {
        // 1. Parsing Payload (รองรับทั้ง JSON และ FormData)
        try {
            payload = typeof req.body.payload === "string" 
                ? JSON.parse(req.body.payload) 
                : req.body;
        } catch (e) {
            throw { status: 400, message: "Invalid payload format" };
        }

        const { 
            type, role, name, lastname, phone, email, password, address, 
            id_number, number_license, agency_name, line_id 
        } = payload;

        // 2. Clean & Validation (ข้อมูลพื้นฐาน)
        const cleanEmail = email?.trim().toLowerCase();
        const cleanPhone = phone?.trim();
        const cleanIdNumber = id_number?.trim();
        const cleanName = name?.trim();
        const cleanLastname = lastname?.trim();
        const cleanLineId = line_id?.trim();

        // เช็คค่าว่าง
        const requiredFields = [cleanName, cleanLastname, cleanPhone, cleanEmail, password, address, cleanIdNumber, cleanLineId];
        if (requiredFields.some(field => !field || field.toString().trim() === "")) {
            throw { status: 400, message: "Missing required information." };
        }

        // เช็คไฟล์รูปภาพหลัก
        if (!files.id_front || !files.id_back || !files.selfie) {
            throw { status: 400, message: "Missing required ID card images (front, back, or selfie)." };
        }

        // เช็ค Format (Regex)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw { status: 400, message: "Invalid email format." };
        if (!/^\d{10}$/.test(cleanPhone)) throw { status: 400, message: "Phone number must be 10 digits." };
        if (!/^\d{13}$/.test(cleanIdNumber)) throw { status: 400, message: "ID card number must be 13 digits." };
        if (password.length < 6) throw { status: 400, message: "Password must be at least 6 characters." };

        // 3. กำหนดสิทธิ์ (Role) และตรวจสอบ Agent
        let roleName = "buyer"; 
        if (type === "investor") roleName = "investor";
        else if (type === "seller") roleName = (role === "agent") ? "agent" : "landlord";

        const isAgent = roleName === "agent";
        const cleanLicenseNum = number_license?.trim();

        if (isAgent) {
            if (!cleanLicenseNum || !agency_name || !files.license_image || !/^\d{10}$/.test(cleanLicenseNum)) {
                throw { status: 400, message: "Agent requires 10-digit license number, agency name, and license image." };
            }
        }

        // 4. เข้าสู่กระบวนการฐานข้อมูล
        const conn = await db.getConnection();
        await conn.beginTransaction();

        try {
            // ด่านตรวจซ้ำ (Email & ID Card) - ใช้ FOR UPDATE เพื่อป้องกัน Race Condition
            const [existing] = await conn.query(
                "SELECT email, number_id_card FROM users WHERE email = ? OR number_id_card = ? FOR UPDATE",
                [cleanEmail, cleanIdNumber]
            );

            if (existing.length > 0) {
                const isEmailDup = existing.some(u => u.email === cleanEmail);
                const isIdDup = existing.some(u => u.number_id_card === cleanIdNumber);
                let errorMsg = isEmailDup && isIdDup ? "Email and ID card already registered" : 
                               isEmailDup ? "Email is already registered" : "ID card number is already registered";
                throw { status: 400, message: errorMsg };
            }

            // เตรียมข้อมูลไฟล์
            const imgFront = files.id_front[0].filename;
            const imgBack = files.id_back[0].filename;
            const imgSelfie = files.selfie[0].filename;
            const finalLicenseImg = isAgent ? files.license_image[0].filename : null;

            // ลบไฟล์ใบอนุญาตหากไม่ใช่ Agent แต่ส่งไฟล์มา (Cleanup)
            if (!isAgent && files.license_image) {
                files.license_image.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
            }

            // Hash Password และ Insert
            const hashed = await bcrypt.hash(password, 12);
            const insertUserSql = `
                INSERT INTO users (
                    email, password_hash, first_name, last_name, phone, address, 
                    number_id_card, id_card_image_front, id_card_image_back, 
                    selfie, number_license, license_image, agency_name,
                    line_id, role_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT role_id FROM roles WHERE role_name = ?))
            `;

            await conn.query(insertUserSql, [
                cleanEmail, hashed, cleanName, cleanLastname, cleanPhone, address.trim(),
                cleanIdNumber, imgFront, imgBack, imgSelfie,
                isAgent ? cleanLicenseNum : null,
                finalLicenseImg,
                isAgent ? agency_name.trim() : null,
                cleanLineId, roleName
            ]);

            await conn.commit();
            res.status(201).json({ message: "Signup successful" });

        } catch (dbErr) {
            await conn.rollback();
            throw dbErr; // ส่งต่อไปยัง catch ใหญ่
        } finally {
            conn.release();
        }

    } catch (err) {
        // ลบไฟล์ทั้งหมดที่อัปโหลดมาหากเกิดข้อผิดพลาด
        if (req.files) deleteUploadedFiles(req.files);

        console.error("Signup Error Log:", err);

        // ตอบกลับ Error ตามประเภท
        const statusCode = err.status || 500;
        const errorMessage = err.message || "Internal server error";
        
        res.status(statusCode).json({ error: errorMessage });
    }
};

// ฟังก์ชันช่วยลบไฟล์ (Helper Function)
function deleteUploadedFiles(files) {
    if (!files) return;
    Object.values(files).forEach(fileArray => {
        fileArray.forEach(file => {
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        });
    });
}

// ================= ADD ADMIN =================
exports.addAdmin = async (req, res) => {
    const { role_id, admin_name, email, password } = req.body;

    // 1. ตรวจสอบค่าว่าง (Basic Check)
    if (!role_id || !admin_name || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
    }

    // 2. Clean ข้อมูลพื้นฐาน
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = admin_name.trim();

    try {
        // 3. ดักรูปแบบอีเมล (Email Format Validation)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ error: "Invalid email format" });
        }

        // 4. ดักความยาวรหัสผ่าน (Password Length >= 6)
        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters long" });
        }

        // 5. ดักความยาวชื่อ (Optional - เพื่อป้องกันข้อมูลขยะ)
        if (cleanName.length < 2) {
            return res.status(400).json({ error: "Admin name is too short" });
        }

        // 6. ตรวจสอบว่าอีเมลนี้มีอยู่ในระบบหรือยัง (Check Duplicate)
        // เพื่อป้องกันการ Error ที่ชั้น Database เราเช็คก่อนจะดีกว่า
        const [existingAdmin] = await db.query("SELECT email FROM admin WHERE email = ?", [cleanEmail]);
        if (existingAdmin.length > 0) {
            return res.status(400).json({ error: "Email is already registered" });
        }

        // 7. Hash รหัสผ่าน
        const saltRounds = 12;
        const password_hash = await bcrypt.hash(password, saltRounds);

        // 8. บันทึกลงตาราง admin
        const [result] = await db.query(
            `INSERT INTO admin (role_id, admin_name, email, password_hash) VALUES (?, ?, ?, ?)`,
            [role_id, cleanName, cleanEmail, password_hash]
        );

        res.status(201).json({ 
            message: "Admin created successfully", 
            adminId: result.insertId 
        });

    } catch (err) {
        console.error("Add Admin Error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
};
// ================= LOGIN (Single Role Version) =================
exports.login = async (req, res) => {
  // 1. รับค่าและใช้ .trim() ทันทีเพื่อตัดช่องว่างหัว-ท้าย
  const email = req.body.email?.trim();
  const password = req.body.password?.trim();

  // 2. ดักกรณีไม่ได้กรอก หรือ กรอกแต่ Spacebar
  if (!email || !password) {
    return res.status(400).json({ 
      error: "Email and password are required (Spacebar is not allowed)" 
    });
  }

  // 3. ดักรูปแบบ Email (Regex)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // 4. ดักความยาวรหัสผ่าน (ขั้นต่ำ 6 ตัว)
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    let user = null;
    let userRole = null;
    let userId = null;

    // --- ส่วนการ Query Database (เหมือนเดิม) ---
    // 1. ค้นหาในตาราง admin
    const [adminData] = await db.query(
      `SELECT a.*, r.role_name FROM admin a 
       JOIN roles r ON a.role_id = r.role_id WHERE a.email = ?`, [email]
    );

    if (adminData.length > 0) {
      user = adminData[0];
      userRole = user.role_name; 
      userId = user.admin_id;
    } else {
      // 2. ถ้าไม่เจอใน admin ให้หาใน users
      const [userData] = await db.query(
        `SELECT u.*, r.role_name FROM users u 
         JOIN roles r ON u.role_id = r.role_id WHERE u.email = ?`, [email]
      );

      if (userData.length > 0) {
        user = userData[0];
        userRole = user.role_name; 
        userId = user.user_id;
      }
    }

    if (!user) return res.status(401).json({ error: "Invalid email" });

    // 5. ตรวจสอบรหัสผ่าน
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: "Invalid password" });

    // 6. สร้าง Token
    const token = jwt.sign(
      { id: userId, role: userRole },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({ message: "Login success", token, role: userRole });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

// ================= GET USER COUNT =================
exports.getUserCount = async (req, res) => {
  try {
    const [rows] = await db.query("SELECT COUNT(*) as total_users FROM users");
    res.json(rows[0]); // ผลลัพธ์จะเป็น { "total_users": 15 }
  } catch (err) {
    res.status(500).json({ error: "Internal server error" });
  }
};

// ================= GET ALL USERS (WITH IMAGES) =================
exports.getAllUsers = async (req, res) => {
  try {
    const sql = `
      SELECT 
        user_id, 
        email, 
        first_name, 
        last_name, 
        phone, 
        address, 
        number_id_card, 
        id_card_image_front, 
        id_card_image_back, 
        selfie, 
        number_license, 
        license_image, 
        agency_name, 
        created_at 
      FROM users
    `;
    
    const [users] = await db.query(sql);
    
    // ส่งข้อมูลกลับไปพร้อมจำนวน
    res.json({
      success: true,
      count: users.length,
      data: users
    });

  } catch (err) {
    console.error("Admin Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};



