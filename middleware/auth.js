const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1. ตรวจสอบว่ามี Header และขึ้นต้นด้วย Bearer หรือไม่
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      error: "Access denied: No token provided or invalid format" 
    });
  }

  // 2. แยก Token ออกจาก "Bearer <token>"
  const token = authHeader.split(" ")[1];

  // กรณีมีแค่คำว่า Bearer แต่ไม่มี token ต่อท้าย
  if (!token) {
    return res.status(401).json({ error: "Access denied: Token missing" });
  }

  try {
    // 3. ยืนยันความถูกต้องของ Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // เก็บข้อมูล user (id, roles) ไว้ใน req เพื่อให้ middleware ตัวถัดไป (role.js) ใช้งาน
    req.user = decoded;
    
    next();
  } catch (err) {
    // แยกแยะระหว่าง Token หมดอายุ กับ Token ปลอม (ถ้าต้องการละเอียดขึ้น)
    const message = err.name === "TokenExpiredError" ? "Token expired" : "Invalid token";
    res.status(401).json({ error: `Authentication failed: ${message}` });
  }
};