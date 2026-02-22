const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1. ตรวจสอบ Header และรูปแบบ Bearer Token
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      error: "Access denied: No token provided or invalid format" 
    });
  }

  // 2. แยก Token ออกจาก "Bearer <token>"
  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access denied: Token missing" });
  }

  try {
    // 3. ยืนยันความถูกต้องของ Token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // --- จุดที่แก้ไข: แตกข้อมูลออกมาให้ Controller เรียกใช้ง่ายๆ ---
    req.user = decoded;      // เก็บก้อน Object เต็มไว้ (เผื่อใช้ในอนาคต)
    req.id = decoded.id;     // ตรงกับ req.id ใน getProfile, getTransactions
    req.role = decoded.role; // ตรงกับ req.role ในการเช็คสิทธิ์ต่างๆ
    req.type = decoded.type; // ประเภทตาราง ('user' หรือ 'admin')
    
    next();
  } catch (err) {
    // 4. จัดการ Error กรณี Token มีปัญหา
    let message = "Invalid token";
    if (err.name === "TokenExpiredError") {
      message = "Token expired";
    } else if (err.name === "JsonWebTokenError") {
      message = "Invalid signature";
    }

    res.status(401).json({ error: `Authentication failed: ${message}` });
  }
};