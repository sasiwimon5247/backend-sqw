const mysql = require("mysql2");

// เปลี่ยนจาก createConnection เป็น createPool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "sqw",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ตรวจสอบการเชื่อมต่อ
pool.getConnection((err, connection) => {
  if (err) {
    console.error("MySQL Connection Error: ", err);
  } else {
    console.log("MySQL Connected (Pool)");
    connection.release(); // คืนสายกลับเข้า Pool
  }
});

// ส่งออกเป็น promise() เพื่อให้ Controller ใช้ await ได้เลย
module.exports = pool.promise();