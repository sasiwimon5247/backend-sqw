require('dotenv').config();
const db = require("../config/db");
// ================= เพิ่มข้อมูลที่ดินใหม่ (POST /api/lands) =================
exports.addLand = async (req, res) => {
    // 1. รับค่าจาก Request Body
    // หมายเหตุ: images ถูกจัดเตรียมโดย middleware ใน router (req.body.images)
    let { 
        rai, ngan, wa, 
        frontage_width, price_per_sqwa, price_total, 
        seller_name, agency_name, phone, line_id, doc_detail, images 
    } = req.body;
    
    const userId = req.id; 
    const userRole = req.role;

    // 2. [Security Check] ตรวจสอบการเข้าสู่ระบบและสิทธิ์การใช้งาน
    if (!userId) {
        return res.status(401).json({ message: "Unauthorized access. Please login." });
    }

    const allowedRoles = ["landlord", "agent"];
    if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ 
            message: "Permission denied. Only landlords or agents can post land listings." 
        });
    }

    // 3. [Validation] จัดการข้อความพื้นฐาน
    seller_name = seller_name?.trim();
    phone = phone?.trim();
    line_id = line_id?.trim();
    doc_detail = doc_detail?.trim();
    agency_name = agency_name?.trim() || null;

    // ตรวจสอบรูปแบบเบอร์โทรศัพท์ (10 หลัก ขึ้นต้นด้วย 0)
    if (!phone || !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: "Invalid phone number format. Must be 10 digits starting with 0." });
    }

    if (!seller_name || !line_id || !doc_detail) {
        return res.status(400).json({ message: "Contact information and document details are required." });
    }

    // 4. [Validation] แปลงค่าและตรวจสอบตัวเลข (เนื่องจาก Form-data ส่งค่ามาเป็น String)
    const nRai = parseInt(rai) || 0;
    const nNgan = parseInt(ngan) || 0;
    const nWa = parseFloat(wa) || 0;
    const nFrontage = parseFloat(frontage_width) || 0;
    const nPriceSqwa = parseFloat(price_per_sqwa) || 0;
    const nPriceTotal = parseFloat(price_total) || 0;

    if (nRai < 0 || nNgan < 0 || nWa < 0) {
        return res.status(400).json({ message: "Invalid land size values." });
    }

    if (nFrontage <= 0 || nPriceSqwa <= 0 || nPriceTotal <= 0) {
        return res.status(400).json({ message: "Price and frontage width must be greater than 0." });
    }

    // 5. [Business Logic] คำนวณพื้นที่รวมและตรวจสอบความถูกต้องของราคาสุทธิ
    const area_sqwa = (nRai * 400) + (nNgan * 100) + nWa;
    if (area_sqwa <= 0) {
        return res.status(400).json({ message: "Total area size must be greater than 0 Sq. Wa." });
    }

    const expected_total = area_sqwa * nPriceSqwa;
    // อนุโลมส่วนต่าง 5 บาท เพื่อป้องกันปัญหา Floating point ในการคำนวณ
    if (Math.abs(expected_total - nPriceTotal) > 5) { 
        return res.status(400).json({ message: "Total price does not match the price per Sq. Wa calculation." });
    }

    // 6. [Image Check] ตรวจสอบว่ามีการส่งรูปภาพมาหรือไม่
    if (!images || !Array.isArray(images) || images.length === 0) {
        return res.status(400).json({ message: "At least one land image is required." });
    }
    const finalImages = images.slice(0, 5); // จำกัดสูงสุด 5 รูป

    // 7. [Database Transaction] เริ่มต้นการบันทึกข้อมูลแบบ Transaction
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        // บันทึกข้อมูลลงตารางหลัก (lands)
        const landSql = `
            INSERT INTO lands (
                seller_id, rai, ngan, wa, area_sqwa, 
                price_per_sqwa, price_total, frontage_width, 
                seller_name, agency_name, phone, line_id,
                view_count, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'broadcast', NOW())
        `;
        
        const [landResult] = await conn.query(landSql, [
            userId, nRai, nNgan, nWa, area_sqwa, 
            nPriceSqwa, nPriceTotal, nFrontage,
            seller_name, agency_name, phone, line_id
        ]);
        
        const newLandId = landResult.insertId;

        // บันทึกรูปภาพ (Bulk Insert)
        const imageValues = finalImages.map(imgName => [newLandId, imgName]);
        await conn.query("INSERT INTO land_images (land_id, image) VALUES ?", [imageValues]);

        // บันทึกข้อมูลเอกสาร (เช่น โฉนด)
        await conn.query(
            "INSERT INTO land_documents (land_id, doc_type, file) VALUES (?, 'โฉนด', ?)", 
            [newLandId, doc_detail]
        );

        // ยืนยันการบันทึกข้อมูลทั้งหมด
        await conn.commit();
        
        res.status(201).json({ 
            status: "success", 
            land_id: newLandId,
            message: "Land information has been saved successfully." 
        });

    } catch (error) {
        // หากเกิดข้อผิดพลาด ให้ยกเลิกคำสั่งทั้งหมดใน Transaction นี้
        if (conn) await conn.rollback();
        console.error("ADD_LAND_ERROR:", error);
        res.status(500).json({ message: "Internal server error. Failed to save land information." });
    } finally {
        // คืน Connection กลับสู่ Pool
        if (conn) conn.release();
    }
};

// ================= ดึงรายละเอียดที่ดิน (GET /api/lands/:id) =================
exports.getLandDetail = async (req, res) => {
    const landId = req.params.id;
    const userId = req.id; 
    
    if (!landId) return res.status(400).json({ message: "Land ID is required." });

    const conn = await db.getConnection();

    try {
        // 1. ดึงข้อมูลจาก lands โดยตรง (ไม่ต้อง JOIN users เพื่อเอาเบอร์โทรแล้ว เพราะเรา Snapshot ไว้ใน lands)
        const landQuery = `SELECT * FROM lands WHERE land_id = ?`;
        const [landData] = await conn.query(landQuery, [landId]);

        if (landData.length === 0) {
            return res.status(404).json({ message: "Land information not found." });
        }

        const land = landData[0];

        // 2. ดึงรูปภาพและเอกสาร
        const [images] = await conn.query("SELECT image FROM land_images WHERE land_id = ?", [landId]);
        const [documents] = await conn.query("SELECT doc_type, file FROM land_documents WHERE land_id = ?", [landId]);

        // 3. ตรวจสอบการปลดล็อก
        let unlockedSet = new Set();
        if (userId) {
            const [unlockedItems] = await conn.query(
                "SELECT unlock_type FROM unlocked_lands WHERE user_id = ? AND land_id = ?",
                [userId, landId]
            );
            unlockedSet = new Set(unlockedItems.map(i => i.unlock_type));
        }

        const MASK = "-----"; 

        const responseData = {
            land_id: land.land_id,
            price_total: land.price_total,
            price_per_sqwa: land.price_per_sqwa,
            area_sqwa: land.area_sqwa,
            rai: land.rai,
            ngan: land.ngan,
            wa: land.wa,
            view_count: land.view_count + 1,
            images: images.map(img => img.image),

            // แก้ไขจุดนี้: ดึงข้อมูลจากตาราง lands ที่เรา Snapshot ไว้
            contact: {
                seller_name: unlockedSet.has('owner') ? land.seller_name : MASK,
                agency: unlockedSet.has('owner') ? (land.agency_name || "ส่วนตัว") : MASK,
                phone: unlockedSet.has('contact') ? land.phone : MASK,
                line_id: unlockedSet.has('contact') ? land.line_id : MASK
            },
            
            documents: documents.map(doc => {
                let isLocked = true;
                if (doc.doc_type === 'กรอบที่ดิน' && unlockedSet.has('boundary')) isLocked = false;
                if ((doc.doc_type === 'โฉนด' || doc.doc_type === 'ระวาง') && unlockedSet.has('document')) isLocked = false;

                return {
                    doc_type: doc.doc_type,
                    file: isLocked ? MASK : doc.file,
                    is_locked: isLocked
                };
            }),
            unlocked_list: Array.from(unlockedSet)
        };

        await conn.query("UPDATE lands SET view_count = view_count + 1 WHERE land_id = ?", [landId]);
        res.status(200).json(responseData);

    } catch (error) {
        console.error("GET_LAND_DETAIL_ERROR:", error);
        res.status(500).json({ message: "Internal server error." });
    } finally {
        if (conn) conn.release();
    }
};

// ================= ปลดล็อกข้อมูลที่ดิน (POST /api/lands/unlock) =================
exports.unlockLandItems = async (req, res) => {
    const { land_id, items } = req.body; 
    const userId = req.id; 

    // ดักจับข้อมูลที่ไม่ถูกต้อง
    if (!userId) return res.status(401).json({ message: "Unauthorized access." });
    if (!land_id || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Please select items to unlock." });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        // เตรียมข้อมูลสำหรับ Bulk Insert
        // ใช้ INSERT IGNORE เพื่อข้ามรายการที่เคยปลดล็อกไปแล้วอัตโนมัติ
        const values = items.map(item => [userId, land_id, item]);
        
        const sql = "INSERT IGNORE INTO unlocked_lands (user_id, land_id, unlock_type) VALUES ?";
        await conn.query(sql, [values]);

        await conn.commit();
        res.status(201).json({ 
            status: "success", 
            message: "Transaction processed successfully." 
        });

    } catch (error) {
        await conn.rollback();
        console.error("UNLOCK_ERROR:", error);
        res.status(500).json({ message: "Failed to process unlock transaction." });
    } finally {
        if (conn) conn.release();
    }
};
