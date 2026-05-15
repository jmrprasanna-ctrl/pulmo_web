const express = require("express");
const router = express.Router();
const supportTechPayController = require("../controllers/supportTechPayController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get(
  "/invoices",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  supportTechPayController.listSupportTechPayInvoices
);
router.get(
  "/:invoiceId",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  supportTechPayController.getSupportTechPayInvoice
);
router.put(
  "/:invoiceId",
  authMiddleware,
  roleMiddleware(["admin", "manager", "user"]),
  supportTechPayController.updateSupportTechPayInvoice
);

module.exports = router;
