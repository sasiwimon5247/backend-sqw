const express = require("express");
const multer = require("multer");
const router = express.Router();
const authCtrl = require("../controllers/auth.controller");
const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth"); 
const role = require("../middleware/role");
const upload = require("../middleware/upload");

// ================= PUBLIC =================
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
router.get("/profile", auth, authCtrl.getProfile);
router.put("/profile", auth, authCtrl.updateProfile);
router.put("/security/change-password", auth, authCtrl.changePassword);
router.post("/security/2fa", auth, authCtrl.toggle2FA);

// ================= ADMIN ONLY =================
router.post('/add-admin', auth, role("admin"), authCtrl.addAdmin);

module.exports = router;