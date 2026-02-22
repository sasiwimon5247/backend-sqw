const express = require("express");
const multer = require("multer");
const router = express.Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middleware/auth");
const role = require("../middleware/role");
const upload = require("../middleware/upload");

// ================= PUBLIC =================
// Signup พร้อมระบบดัก Error ของ Multer ภายในตัว
router.post("/signup", (req, res, next) => {
  const multiUpload = upload.fields([
    { name: "id_front", maxCount: 1 },
    { name: "id_back", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "license_image", maxCount: 1 }
  ]);

  multiUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload Error: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
}, authCtrl.signup);

router.post("/login", authCtrl.login);
router.post('/forgot-password', authCtrl.forgotPassword);
router.post('/reset-password', authCtrl.resetPassword);

// ================= PROTECTED (All Auth Users) =================
// จัดกลุ่มข้อมูล Profile (อ้างอิงตามฟังก์ชันที่มีใน Controller)
router.get("/profile", auth, authCtrl.getProfile);
router.put("/profile", auth, authCtrl.updateProfile);
router.put("/security/change-password", auth, authCtrl.changePassword);
router.post("/security/2fa", auth, authCtrl.toggle2FA);

// ================= ADMIN ONLY =================
// ควรป้องกันการเพิ่ม Admin ด้วยการเช็คสิทธิ์ Admin เดิมก่อน
router.post('/add-admin', auth, role("admin"), authCtrl.addAdmin);

// ================= land ========================
// ดึงรายละเอียดที่ดิน
router.get('/lands/:id', auth, authCtrl.getLandDetail);
// ปลดล็อกข้อมูลที่ดิน (เพิ่มเข้าไปตรงนี้)
router.post('/lands/unlock', auth, authCtrl.unlockLandItems);

module.exports = router;