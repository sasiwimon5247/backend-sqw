const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true }); // เพิ่ม recursive เพื่อความปลอดภัย
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // ใช้ timestamp + random number เพื่อป้องกันชื่อซ้ำ 100%
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // เปลี่ยนชื่อไฟล์ให้เป็นตัวพิมพ์เล็กและไม่มีช่องว่าง (ป้องกันปัญหากับ URL)
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  // รองรับเฉพาะไฟล์รูปภาพหลักๆ
  const allowedTypes = /jpeg|jpg|png|webp/; // เพิ่ม webp เข้าไปเผื่อยุคปัจจุบัน
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    // ส่ง Error ไปที่ด่านถัดไป
    const err = new Error("Invalid file type. Only jpg, jpeg, png, and webp are allowed.");
    err.code = "LIMIT_FILE_TYPES"; // ใส่ Code เพื่อให้จัดการง่าย
    cb(err, false);
  }
};

module.exports = multer({
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // จำกัดที่ 5MB (เหมาะสมสำหรับรูปถ่ายบัตร)
    files: 5 // จำกัดจำนวนไฟล์สูงสุดต่อ Request ป้องกัน Spam
  },
  fileFilter,
});