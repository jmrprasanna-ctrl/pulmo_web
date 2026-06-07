const express = require("express");
const { login, register, forgotPassword, getCompanyByCode } = require("../controllers/authController");

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.get("/company-code/:companyCode", getCompanyByCode);

module.exports = router;
