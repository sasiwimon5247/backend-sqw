module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    // 1. ตรวจสอบว่ามีข้อมูล user จาก auth middleware หรือไม่
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. ดึง Role ออกมา 
    // ใน Login คุณเก็บไว้ในชื่อ roles (ซึ่งเป็น Array เช่น ["admin"])
    // ถ้ามั่นใจว่า 1 คนมี 1 โรลแน่ๆ ให้ดึงตัวแรกออกมาครับ
    const userRole = Array.isArray(req.user.roles) ? req.user.roles[0] : req.user.role;

    // 3. เช็คสิทธิ์
    // allowedRoles จะเป็น Array ของสิทธิ์ที่อนุญาต เช่น ["admin", "agent"]
    const hasPermission = allowedRoles.includes(userRole);

    if (!hasPermission) {
      return res.status(403).json({ 
        error: "Access denied: Role insufficient" 
      });
    }

    next();
  };
};