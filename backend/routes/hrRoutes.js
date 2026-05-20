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
router.post(
  "/timesheet/log",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.createTimesheetLog
);
router.put(
  "/timesheet/log/:logId",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.updateTimesheetLog
);
router.get(
  "/sallary/users",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getSallaryUsers
);
router.get(
  "/sallary/:userId",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getSallaryDetailByUserId
);
router.get(
  "/sallary/:userId/work-summary",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getSallaryWorkSummary
);
router.put(
  "/sallary/:userId",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.upsertSallaryDetailByUserId
);
router.get(
  "/leave/meta",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getLeaveMeta
);
router.post(
  "/leave/apply",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.applyLeave
);
router.get(
  "/payslip/users",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getPayslipUsers
);
router.get(
  "/payslip/:userId",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.getPayslipByUserId
);
router.post(
  "/payslip/:userId/send-email",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  hrController.sendPayslipEmail
);

module.exports = router;
