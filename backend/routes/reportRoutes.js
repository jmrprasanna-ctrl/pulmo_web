const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.use(authMiddleware);

router.get("/sales", roleMiddleware(["admin","manager","user"]), reportController.salesReport);
router.get("/expenses", roleMiddleware(["admin","manager"]), reportController.expenseReport);
router.get("/profit-loss", roleMiddleware(["admin","manager"]), reportController.profitLossReport);
router.get("/technician-invoices-monthly", roleMiddleware(["admin","manager"]), reportController.technicianInvoicesMonthlyReport);
router.get("/stock-low", roleMiddleware(["admin","manager"]), reportController.lowStockReport);
router.get("/stock-out", roleMiddleware(["admin","manager"]), reportController.outOfStockReport);
router.get("/vendor-products", roleMiddleware(["admin","manager","user"]), reportController.vendorWiseProductsReport);
router.get("/rental-consumables", roleMiddleware(["admin","manager","user"]), reportController.rentalConsumablesMachineCustomerReport);
router.get("/rental-counts", roleMiddleware(["admin","manager","user"]), reportController.rentalCountMachineCustomerReport);
router.get("/rental-machines-copy-count", roleMiddleware(["admin","manager","user"]), reportController.rentalMachineCopyCountPriceReport);
router.get("/pending-invoices-yearly", roleMiddleware(["admin","manager","user"]), reportController.pendingInvoicesByYear);
router.get("/finance-overview", roleMiddleware(["admin","manager","user"]), reportController.financeOverview);

module.exports = router;
