const express = require("express");
const { login, register, forgotPassword, getCompanyByCode, getCompanyLogoByCode } = require("../controllers/authController");

const router = express.Router();

router.post("/login", login);
router.post("/register", register);
router.post("/forgot-password", forgotPassword);
router.get("/company-code/:companyCode/logo", getCompanyLogoByCode);
router.get("/company-code/:companyCode", getCompanyByCode);

module.exports = router;
