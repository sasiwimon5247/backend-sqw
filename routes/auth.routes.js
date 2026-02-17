const express = require("express");
const multer = require("multer");
const router = express.Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const upload = require("../middleware/upload");

// ================= PUBLIC =================
router.post("/signup",
  upload.fields([
    { name: "id_front", maxCount: 1 },
    { name: "id_back", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "license_image", maxCount: 1 } 
  ]),
  authCtrl.signup
);

router.post('/add-admin', authCtrl.addAdmin);

router.post("/login", authCtrl.login);

// ================= PROTECTED (All Auth Users) =================
// ตัวอย่างหน้า Profile ที่ทุกคนเข้าได้ขอแค่ล็อกอิน
router.get("/me", auth, (req, res) => {
    res.json({ user: req.user });
});

// ================= ADMIN ONLY =================
router.get("/admin/users", auth, role("admin"), authCtrl.getAllUsers);
router.get("/admin/stats", auth, role("admin"), authCtrl.getUserCount);

// ================= ROLE SPECIFIC =================
router.get("/investor-dashboard", auth, role("investor"), (req, res) => {
  res.json({ ok: true, message: "Welcome Investor" });
});

router.get("/buyer-dashboard", auth, role("buyer"), (req, res) => {
  res.json({ ok: true, message: "Welcome Buyer" });
});

// สำหรับ Seller ที่อาจจะเป็นได้ทั้ง Agent และ Landlord
router.get("/seller-tools", auth, role("agent", "landlord"), (req, res) => {
  res.json({ ok: true, message: "Welcome Seller (Agent or Landlord)" });
});

// ตัวอย่างการรับ Error ใน Router 
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // Error จาก Multer (เช่น ไฟล์ใหญ่เกิน)
    return res.status(400).json({ error: `Upload Error: ${err.message}` });
  } else if (err) {
    // Error อื่นๆ (เช่น จาก fileFilter)
    return res.status(400).json({ error: err.message });
  }
  next();
});

// 1. Route สำหรับ "ขอ" รีเซ็ตรหัสผ่าน (ส่งอีเมล)
// URL: POST /api/auth/forgot-password
router.post('/forgot-password', authCtrl.forgotPassword);

// 2. Route สำหรับ "ตั้ง" รหัสผ่านใหม่ 
// URL: POST /api/auth/reset-password/:token
// :token คือตัวแปรที่จะรับมาจากลิงก์ในอีเมล
router.post('/reset-password/:token', authCtrl.resetPassword);

module.exports = router;