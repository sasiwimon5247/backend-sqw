const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    // เปลี่ยนชื่อไฟล์ให้สะอาด ป้องกันปัญหาอักขระพิเศษ
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    const err = new Error("Only .jpg, .jpeg, .png, and .webp files are allowed!");
    err.code = "LIMIT_FILE_TYPES";
    cb(err, false);
  }
};

const upload = multer({
  storage,
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 10 // เพิ่มจาก 5 เป็น 10 เพื่อรองรับเคส Agent (Front, Back, Selfie, License, etc.)
  },
  fileFilter,
});

module.exports = upload;