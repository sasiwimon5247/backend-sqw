const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ถ้าไม่มี Token หรือ Format ผิด ให้ปล่อยผ่านไปเฉยๆ (req.id จะเป็น undefined)
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next(); 
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    req.id = decoded.id;
    req.role = decoded.role;
    next();
  } catch (err) {
    // ถ้า Token มีแต่ดันผิดหรือหมดอายุ ก็ให้ถือว่าเป็น Guest (ไม่เก็บ req.id)
    next();
  }
};