module.exports = (roles) => {
  // ทำให้มั่นใจว่าเป็น Array เสมอ ไม่ว่าจะส่งมาท่าไหน
  const allowedRoles = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });

    const userRole = req.role || req.user.role;
    
    // ใช้ lowercase เพื่อป้องกันปัญหาตัวพิมพ์เล็ก-ใหญ่
    const hasPermission = allowedRoles.some(r => r.toLowerCase() === userRole.toLowerCase());

    if (!hasPermission) {
      return res.status(403).json({ 
        error: `Access denied: Your role (${userRole}) is not authorized` 
      });
    }
    next();
  };
};