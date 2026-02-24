const router = require("express").Router();
const landCtrl = require("../controllers/land.controller"); 
const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const role = require("../middleware/role"); 
const multer = require("multer");

// ตั้งค่า Multer (แนะนำให้ทำเป็น middleware แยก หรือตั้งค่าไว้ด้านบน)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/lands/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // จำกัดขนาด 5MB (ถ้าต้องการ)
});

// ------------------------------------------

// เพิ่มข้อมูลที่ดินใหม่ (POST /api/lands)
router.post("/", 
    auth, 
    role(["landlord", "agent"]), 
    (req, res, next) => {
        const landUpload = upload.array("images", 5);
        landUpload(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_UNEXPECTED_FILE") {
                    return res.status(400).json({ error: "ส่งรูปได้สูงสุด 5 รูปเท่านั้น" });
                }
                return res.status(400).json({ error: err.message });
            } else if (err) {
                return res.status(400).json({ error: err.message });
            }
            
            // นำ path หรือ filename ใส่ใน req.body.images เพื่อให้ Controller ใช้งานต่อ
            if (req.files && req.files.length > 0) {
                // แนะนำให้เก็บเป็น path หรือ filename
                req.body.images = req.files.map(file => file.filename);
            }
            next();
        });
    }, 
    landCtrl.addLand
); 

// ดึงรายละเอียด (GET /api/lands/:id)
router.get("/:id", optionalAuth, landCtrl.getLandDetail); 

// ปลดล็อก (POST /api/lands/unlock)
router.post("/unlock", auth, landCtrl.unlockLandItems); 

module.exports = router;