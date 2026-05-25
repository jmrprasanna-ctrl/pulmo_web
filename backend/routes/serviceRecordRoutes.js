const express = require("express");
const router = express.Router();
const serviceRecordController = require("../controllers/serviceRecordController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const manageOrDemoUserMiddleware = require("../middleware/manageOrDemoUserMiddleware");

router.get("/", authMiddleware, roleMiddleware(["admin", "manager", "user"]), serviceRecordController.getServiceRecords);
router.post("/", authMiddleware, manageOrDemoUserMiddleware, serviceRecordController.createServiceRecord);
router.delete("/:id", authMiddleware, manageOrDemoUserMiddleware, serviceRecordController.deleteServiceRecord);

module.exports = router;
