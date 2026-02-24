require('dotenv').config();
// console.log("--- SMTP DEBUG START ---");
// console.log("EMAIL_USER:", process.env.EMAIL_USER);
// console.log("PASS_VALUE:", process.env.EMAIL_PASS ? "Found" : "NOT FOUND (UNDEFINED)");
// console.log("PASS_LENGTH:", process.env.EMAIL_PASS ? process.env.EMAIL_PASS.length : 0);
// console.log("--- SMTP DEBUG END ---");
const db = require("../config/db");
const fs = require('fs');
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require('crypto'); 
const nodemailer = require('nodemailer'); 
const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS 
    },
    tls: {
        rejectUnauthorized: false
    }
});

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
            type, role, first_name, last_name, phone, email, password, address, 
            id_number, number_license, agency_name, line_id 
        } = payload;

        // 2. Clean & Validation (ข้อมูลพื้นฐาน)
        const Email = email?.trim().toLowerCase();
        const Phone = phone?.trim();
        const IdNumber = id_number?.trim();
        const FirstName = first_name?.trim();
        const LastName = last_name?.trim();
        const LineId = line_id?.trim();

        // เช็คค่าว่าง
        const requiredFields = [FirstName, LastName, Phone, Email, password, address, IdNumber, LineId];
        if (requiredFields.some(field => !field || field.toString().trim() === "")) {
            throw { status: 400, message: "Missing required information." };
        }

        // เช็คไฟล์รูปภาพหลัก
        if (!files.id_front || !files.id_back || !files.selfie) {
            throw { status: 400, message: "Missing required ID card images (front, back, or selfie)." };
        }

        // เช็ค Format (Regex)
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(Email)) throw { status: 400, message: "Invalid email format." };
        const nameRegex = /^[a-zA-Zก-๙\s]+$/;
        if (!nameRegex.test(FirstName)) {
            throw { status: 400, message: "First name must contain only letters (Thai or English)." };
        }
        if (!nameRegex.test(LastName)) {
            throw { status: 400, message: "Last name must contain only letters (Thai or English)." };
        }
        if (!/^\d{10}$/.test(Phone)) throw { status: 400, message: "Phone number must be 10 digits." };
        if (!/^\d{13}$/.test(IdNumber)) throw { status: 400, message: "ID card number must be 13 digits." };
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(password)) {
            throw { status: 400, message: "Password must be at least 6 characters long and contain at least one uppercase letter, one lowercase letter, and one number."};
        }

        // 3. กำหนดสิทธิ์ (Role) และตรวจสอบ Agent
        let roleName = "buyer"; 
        if (type === "investor") roleName = "investor";
        else if (type === "seller") roleName = (role === "agent") ? "agent" : "landlord";

        const isAgent = roleName === "agent";
        const LicenseNum = number_license?.trim();

        if (isAgent) {
            if (!LicenseNum || !agency_name || !files.license_image || !/^\d{10}$/.test(LicenseNum)) {
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
                [Email, IdNumber]
            );

            if (existing.length > 0) {
                const isEmailDup = existing.some(u => u.email === Email);
                const isIdDup = existing.some(u => u.number_id_card === IdNumber);
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
                Email, hashed, FirstName, LastName, Phone, address.trim(),
                IdNumber, imgFront, imgBack, imgSelfie,
                isAgent ? LicenseNum : null,
                finalLicenseImg,
                isAgent ? agency_name.trim() : null,
                LineId, roleName
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
};

// ================= AddAdmin =================
exports.addAdmin = async (req, res) => {
    const { role_id, admin_name, email, password } = req.body;
    const conn = await db.getConnection();

    try {
        if (!role_id || !admin_name || !email || !password) {
            return res.status(400).json({ error: "All fields are required" });
        }

        const Email = email.trim().toLowerCase();
        // ... (ใส่ Regex Validation ตามเดิมของคุณตรงนี้) ...

        const [existingAdmin] = await conn.query("SELECT email FROM admin WHERE email = ?", [Email]);
        if (existingAdmin.length > 0) {
            return res.status(400).json({ error: "Email is already registered" });
        }

        const password_hash = await bcrypt.hash(password, 12);

        const [result] = await conn.query(
            `INSERT INTO admin (role_id, admin_name, email, password_hash) VALUES (?, ?, ?, ?)`,
            [role_id, admin_name.trim(), Email, password_hash]
        );

        res.status(201).json({ message: "Admin created successfully", adminId: result.insertId });

    } catch (err) {
        console.error("Add Admin Error:", err);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        conn.release();
    }
};

// ================= LOGIN =================
exports.login = async (req, res) => {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password?.trim();

    // 1. ตรวจสอบ Input เบื้องต้น
    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    let conn;
    try {
        conn = await db.getConnection();

        let userData = null;
        let userType = null; // 'admin' หรือ 'user'

        // 2. ค้นหาในตาราง Admin ก่อน
        const [adminRows] = await conn.query(
            `SELECT a.admin_id as id, a.password_hash, r.role_name 
             FROM admin a 
             JOIN roles r ON a.role_id = r.role_id 
             WHERE a.email = ?`, [email]
        );

        if (adminRows.length > 0) {
            userData = adminRows[0];
            userType = 'admin';
        } else {
            // 3. ถ้าไม่เจอใน admin ให้หาใน users
            const [userRows] = await conn.query(
                `SELECT u.user_id as id, u.password_hash, r.role_name 
                 FROM users u 
                 JOIN roles r ON u.role_id = r.role_id 
                 WHERE u.email = ?`, [email]
            );
            if (userRows.length > 0) {
                userData = userRows[0];
                userType = 'user';
            }
        }

        // 4. หากไม่พบอีเมลในระบบเลย
        if (!userData) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // 5. ตรวจสอบรหัสผ่าน
        const isMatch = await bcrypt.compare(password, userData.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        // 6. สร้าง JWT Token (ระบุ id, role และ type)
        const token = jwt.sign(
            { 
                id: userData.id, 
                role: userData.role_name,
                type: userType // สำคัญมาก: เพื่อให้ Middleware อื่นๆ แยกตารางถูก
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // 7. ตอบกลับข้อมูลที่จำเป็น
        res.status(200).json({
            message: "Login successful",
            token,
            role: userData.role_name,
            type: userType
        });

    } catch (err) {
        console.error("CRITICAL - Login Error:", err);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        // 8. คืน Connection กลับ Pool เสมอ (ป้องกัน DB เต็ม)
        if (conn) conn.release();
    }
};

// ================= ฟังก์ชันส่ง OTP (forgotPassword) =================
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    const conn = await db.getConnection(); // ดึง connection มาใช้

    try {
        const Email = email?.trim().toLowerCase();
        if (!Email) return res.status(400).json({ error: "Email is required" });

        // 1. ตรวจสอบ User จากทั้ง 2 ตารางพร้อมกัน
        // ใช้ UNION เพื่อเช็คว่าอีเมลนี้อยู่ในตารางไหน
        const [identity] = await conn.query(
            `SELECT 'admin' as table_name FROM admin WHERE email = ?
             UNION
             SELECT 'users' as table_name FROM users WHERE email = ?`,
            [Email, Email]
        );

        if (identity.length === 0) {
            return res.status(404).json({ error: "Email not found" });
        }

        // กรณีที่มีอีเมลซ้ำทั้ง admin และ users (ซึ่งควรเลี่ยง แต่โค้ดนี้จะอัปเดตให้ทั้งคู่เพื่อความปลอดภัย)
        const targetTables = identity.map(row => row.table_name);

        // 2. สร้าง OTP 6 หลัก
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expireTime = new Date(Date.now() + 1 * 60000); // ขยายเป็น 1 นาทีเพื่อ User Experience ที่ดีขึ้น
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');

        // 3. บันทึก OTP ลงทุกตารางที่พบอีเมลนี้
        for (const table of targetTables) {
            await conn.query(
                `UPDATE ${table} SET reset_otp = ?, otp_expires_at = ? WHERE email = ?`,
                [otpHash, expireTime, Email]
            );
        }

        // 4. ส่งอีเมล
        await transporter.sendMail({
            to: Email,
            subject: 'Your Password Reset OTP',
            html: `
                <div style="font-family: sans-serif; text-align: center; border: 1px solid #eee; padding: 20px;">
                    <h2 style="color: #333;">Password Reset OTP</h2>
                    <p>Your OTP for resetting password is:</p>
                    <h1 style="color: #4A90E2; letter-spacing: 5px; font-size: 40px;">${otp}</h1>
                    <p style="color: #666;">This code will expire in <b>1 minutes</b>.</p>
                    <p style="font-size: 12px; color: #999;">If you didn't request this, please ignore this email.</p>
                </div>
            `
        });

        res.json({ message: "OTP sent to your email" });

    } catch (err) {
        console.error("Forgot Password Error:", err);
        res.status(500).json({ error: "Internal server error" });
    } finally {
        conn.release(); // สำคัญมาก: คืน Connection กลับเข้า Pool
    }
};

// ================= ฟังก์ชันตั้งรหัสใหม่ด้วย OTP (resetPassword) =================
exports.resetPassword = async (req, res) => {
    const { email, otp, password, confirmPassword } = req.body;
    
    // 1. ประกาศตัวแปร conn ไว้ด้านนอกเพื่อให้ทุก block (try/catch/finally) เข้าถึงได้
    let conn;

    try {
        // 2. Validation ขั้นต้น (ไม่ต้องใช้ DB)
        if (!email || !otp || !password || !confirmPassword) {
            return res.status(400).json({ error: "Missing required information." });
        }

        if (password !== confirmPassword) {
            return res.status(400).json({ error: "Passwords do not match." });
        }

        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({ 
                error: "Password must be at least 6 characters and contain uppercase, lowercase, and numbers." 
            });
        }

        // 3. เตรียมข้อมูล
        const Email = email.trim().toLowerCase();
        const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
        const currentTime = new Date();

        // 4. ดึง Connection จาก Pool
        conn = await db.getConnection();

        // 5. ค้นหา User (ทำก่อนเริ่ม Transaction เพื่อเช็คสิทธิ์)
        const findUserSql = `
            SELECT 'admin' as type, admin_id as id, password_hash FROM admin 
            WHERE email = ? AND reset_otp = ? AND otp_expires_at > ?
            UNION
            SELECT 'users' as type, user_id as id, password_hash FROM users 
            WHERE email = ? AND reset_otp = ? AND otp_expires_at > ?
        `;

        const [results] = await conn.query(findUserSql, [
            Email, otpHash, currentTime, 
            Email, otpHash, currentTime
        ]);

        if (results.length === 0) {
            return res.status(400).json({ error: "Invalid OTP or OTP has expired." });
        }

        // 6. เริ่มต้น Transaction เมื่อมั่นใจว่าข้อมูลถูกต้องและพร้อม Update
        await conn.beginTransaction();

        const hashedPassword = await bcrypt.hash(password, 12);

        for (const target of results) {
            // เช็ครหัสเก่า (Optional: ป้องกันการตั้งรหัสเดิม)
            const isSamePassword = await bcrypt.compare(password, target.password_hash);
            if (isSamePassword) {
                // หากรหัสเดิมเหมือนกัน ให้ยกเลิก Transaction และแจ้งเตือน
                await conn.rollback();
                return res.status(400).json({ error: "New password cannot be the same as old password." });
            }

            const idField = target.type === 'admin' ? 'admin_id' : 'user_id';
            const updateSql = `
                UPDATE ${target.type} 
                SET password_hash = ?, reset_otp = NULL, otp_expires_at = NULL 
                WHERE ${idField} = ?
            `;
            await conn.query(updateSql, [hashedPassword, target.id]);
        }

        // 7. Commit การเปลี่ยนแปลงทั้งหมด
        await conn.commit();
        res.json({ message: "Password updated successfully." });

    } catch (err) {
        // 8. Error Handling ที่ปลอดภัย (ป้องกัน Error ซ้อน Error)
        console.error("DEBUG - Reset Password Error:", err);

        if (conn) {
            try {
                // พยายาม Rollback เฉพาะเมื่อมี Connection อยู่
                await conn.rollback();
            } catch (rollbackErr) {
                console.error("CRITICAL - Rollback Failed:", rollbackErr);
            }
        }

        const statusCode = err.status || 500;
        const errorMessage = err.message || "Internal server error";
        res.status(statusCode).json({ error: errorMessage });

    } finally {
        // 9. คืน Connection กลับ Pool เสมอ
        if (conn) {
            conn.release();
        }
    }
};

// ================= ดึงข้อมูลโปรไฟล์ (เฉพาะตาราง Users) =================
exports.getProfile = async (req, res) => {
    const conn = await db.getConnection();
    try {
        const userId = req.id; // ดึง id ที่แกะมาจาก Token (ใช้ได้ทั้ง User/Admin ที่ Login ผ่านมา)

        // Query ตรงไปที่ตาราง users และ JOIN ตาราง roles เพื่อเอาชื่อตำแหน่ง
        const query = `
            SELECT u.first_name, u.last_name, u.email, u.phone, u.line_id, r.role_name 
            FROM users u
            JOIN roles r ON u.role_id = r.role_id
            WHERE u.user_id = ?
        `;

        const [data] = await conn.query(query, [userId]);

        // ถ้าหาไม่เจอ (อาจเป็น ID ของ Admin หรือไม่มี ID นี้ในตาราง users)
        if (data.length === 0) {
            return res.status(404).json({ message: "User profile not found" });
        }

        // ส่งข้อมูลผู้ใช้กลับไป
        res.json(data[0]);

    } catch (error) {
        console.error("Get Profile Error:", error);
        res.status(500).json({ message: "Internal server error" });
    } finally {
        conn.release(); // คืน Connection ทุกกรณี
    }
};

// ================= อัปเดตข้อมูลส่วนตัว (PUT /api/profile) =================
exports.updateProfile = async (req, res) => {
    const { first_name, last_name, email, phone, line_id } = req.body;
    const userId = req.id; // ดึงมาจาก Middleware ตรวจสอบ Token
    
    let conn; 
    try {
        // 1. ดึง Connection จาก Pool
        conn = await db.getConnection();

        // 2. Clean & Validation ข้อมูลเบื้องต้น
        const Email = email?.trim().toLowerCase();
        const Phone = phone?.trim();
        const FirstName = first_name?.trim();
        const LastName = last_name?.trim();
        const LineId = line_id?.trim();

        // ดักกรณีค่าว่าง (Required fields)
        if (!FirstName || !LastName || !Email || !Phone || !LineId) {
            return res.status(400).json({ 
                message: "Please provide all required fields (First Name, Last Name, Email, Phone, LineId)" 
            });
        }

        // ดักรูปแบบข้อมูลด้วย Regex (Email / Phone / Name)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const nameRegex = /^[a-zA-Zก-๙\s]+$/;
        
        if (!emailRegex.test(Email)) {
            return res.status(400).json({ message: "Invalid email format" });
        }
        if (!/^\d{10}$/.test(Phone)) {
            return res.status(400).json({ message: "Phone number must be exactly 10 digits" });
        }
        if (!nameRegex.test(FirstName) || !nameRegex.test(LastName)) {
            return res.status(400).json({ message: "Names should contain letters only" });
        }

        // 3. เริ่ม Transaction (ป้องกันข้อมูลค้างหากเกิด Error ระหว่างทาง)
        await conn.beginTransaction();

        // 4. เช็คว่า Email ซ้ำกับ "User คนอื่น" หรือไม่
        const [duplicateCheck] = await conn.query(
            "SELECT email FROM users WHERE email = ? AND user_id != ? FOR UPDATE",
            [Email, userId]
        );

        if (duplicateCheck.length > 0) {
            await conn.rollback();
            return res.status(400).json({ message: "This email is already in use by another account" });
        }

        // 5. ทำการ Update ข้อมูลลง Database
        const [result] = await conn.query(
            `UPDATE users 
             SET first_name = ?, last_name = ?, email = ?, phone = ?, line_id = ?, updated_at = NOW() 
             WHERE user_id = ?`,
            [FirstName, LastName, Email, Phone, LineId, userId]
        );

        // 6. ดักกรณีข้อมูลในระบบหายไป (Existence Check)
        // เช่น Token ยังไม่หมดอายุ แต่ User ถูกลบออกจาก DB ไปแล้ว
        if (result.affectedRows === 0) {
            await conn.rollback(); // ป้องกันอาการค้าง
            return res.status(404).json({ message: "User profile not found" });
        }

        // 7. บันทึกการเปลี่ยนแปลง (Commit)
        await conn.commit();
        res.json({ message: "Profile updated successfully" });

    } catch (error) {
        // ดักกรณี Error ระหว่างทาง ให้ยกเลิกคำสั่งทั้งหมด (Rollback)
        if (conn) await conn.rollback();
        console.error("Update Profile Error:", error);
        res.status(500).json({ 
            message: "Internal server error", 
            error: error.message 
        });
    } finally {
        // ดักการคืน Connection เสมอ (ป้องกัน Resource Leak / DB เต็ม)
        if (conn) conn.release();
    }
};

// ================= เปลี่ยนรหัสผ่าน (PUT /api/security/change-password) =================
exports.changePassword = async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const conn = await db.getConnection();
    try {
        // 1. ตรวจสอบความครบถ้วนและรูปแบบรหัสผ่านใหม่ (Validation)
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: "Please provide both current and new passwords." });
        }

        // ตัวอย่างการดักความยาว 6 ตัวขึ้นไป มีตัวพิมพ์ใหญ่ พิมพ์เล็ก และตัวเลข (เหมือน Sign-up)
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
        if (!passwordRegex.test(newPassword)) {
            return res.status(400).json({ 
                message: "New password must be at least 6 characters long and contain at least one uppercase letter, one lowercase letter, and one number." 
            });
        }

        // 2. ดึงรหัสผ่านเดิมจากฐานข้อมูล
        const [user] = await conn.query('SELECT password_hash FROM users WHERE user_id = ?', [req.id]);
        if (user.length === 0) return res.status(404).json({ message: "User not found." });

        // 3. ตรวจสอบว่ารหัสผ่านเดิม (currentPassword) ถูกต้องหรือไม่
        const isMatch = await bcrypt.compare(currentPassword, user[0].password_hash);
        if (!isMatch) return res.status(400).json({ message: "Incorrect current password." });

        // 4. ตรวจสอบว่ารหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม
        const isSameAsOld = await bcrypt.compare(newPassword, user[0].password_hash);
        if (isSameAsOld) {
            return res.status(400).json({ message: "New password cannot be the same as the current password." });
        }

        // 5. Hash รหัสผ่านใหม่และบันทึก
        const hashedNewPwd = await bcrypt.hash(newPassword, 12); 
        await conn.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [hashedNewPwd, req.id]);
        
        res.json({ message: "Password changed successfully." });
    } catch (error) {
        res.status(500).json({ message: "Internal server error" });
    } finally {
        conn.release();
    }
};

// ================= เปิด/ปิด 2FA (POST /api/security/2fa) =================
exports.toggle2FA = async (req, res) => {
    const { enabled } = req.body; 
    
    // 1. ตรวจสอบว่ามีการส่งค่ามาหรือไม่ และต้องเป็นประเภท Boolean เท่านั้น
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ 
            message: "Invalid request. 'enabled' field must be a boolean (true or false)." 
        });
    }

    const conn = await db.getConnection(); 
    try {
        // 2. อัปเดตสถานะในฐานข้อมูล
        const [result] = await conn.query(
            'UPDATE users SET two_factor_enabled = ? WHERE user_id = ?', 
            [enabled, req.id]
        );

        // (Optional) ตรวจสอบว่ามีการ Update เกิดขึ้นจริงไหม
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.json({ 
            message: `2FA has been ${enabled ? 'enabled' : 'disabled'} successfully.` 
        });

    } catch (error) {
        res.status(500).json({ 
            message: "Internal server error", 
            error: error.message 
        });
    } finally {
        conn.release(); 
    }
};