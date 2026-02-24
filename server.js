const express = require("express");
const cors = require("cors");
const path = require('path');
require("dotenv").config();

const app = express(); 

// --- Middleware ---
app.use(cors()); // จัดการเรื่องสิทธิ์การเข้าถึงจาก Domain อื่น
app.use(express.json()); // รองรับข้อมูลแบบ JSON
app.use(express.urlencoded({ extended: true })); // รองรับข้อมูลจาก Form

// เปิดโฟลเดอร์ uploads ให้เข้าถึงไฟล์ผ่าน http://localhost:5000/uploads/...
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Routes ---
const authRoutes = require("./routes/auth.routes");
const landRoutes = require("./routes/land.routes"); 

app.use("/api/auth", authRoutes); // สำหรับ Signup, Login, Profile
app.use("/api/lands", landRoutes); // สำหรับข้อมูลที่ดินและการปลดล็อก (API จะดูคลีนกว่ามาก)

// Test route สำหรับเช็คสถานะระบบ
app.get("/", (req, res) => {
  res.json({ message: "Backend Server is running" });
});

// --- Global Error Handler ---
// ดักจับ Error ที่หลุดมาจากส่วนอื่นๆ เพื่อไม่ให้ Server ล่ม
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong on the server!" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));