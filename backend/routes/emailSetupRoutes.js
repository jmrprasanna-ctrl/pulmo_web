const express = require("express");
const router = express.Router();
const emailSetupController = require("../controllers/emailSetupController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/", authMiddleware, roleMiddleware(["admin", "manager", "user"]), emailSetupController.getEmailSetup);
router.post("/", authMiddleware, roleMiddleware(["admin", "manager", "user"]), emailSetupController.saveEmailSetup);

module.exports = router;
