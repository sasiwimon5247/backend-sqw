module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    // 1. ตรวจสอบว่ามีข้อมูล user จาก auth middleware หรือไม่
    // (เราใช้ req.user เพราะใน auth.js เราสั่ง req.user = decoded ไว้)
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // 2. ดึง Role ออกมา 
    // แก้ไข: จากเดิมที่เช็คหลายตลบ ให้ดึงจาก req.role หรือ req.user.role โดยตรง
    // เพราะใน login คุณฝังมาเป็น String ตัวเดียว (เช่น "admin", "buyer")
    const userRole = req.role || req.user.role;

    // 3. เช็คสิทธิ์
    // allowedRoles คือค่าที่เราส่งเข้าไปตอนเรียกใช้ เช่น checkRole('admin', 'agent')
    const hasPermission = allowedRoles.includes(userRole);

    if (!hasPermission) {
      return res.status(403).json({ 
        error: `Access denied: Your role (${userRole}) is not authorized` 
      });
    }

    next();
  };
};