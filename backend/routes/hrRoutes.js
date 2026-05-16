const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const hrController = require("../controllers/hrController");

router.get(
  "/inout/status",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getInOutStatus
);
router.post(
  "/inout/check-in",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.checkIn
);
router.post(
  "/inout/check-out",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.checkOut
);
router.get(
  "/timesheet/monthly",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getMonthlyTimeSheet
);

module.exports = router;
