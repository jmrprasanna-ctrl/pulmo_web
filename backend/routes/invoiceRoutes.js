const express = require("express");
const router = express.Router();
const invoiceController = require("../controllers/invoiceController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/generate-no", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.generateInvoiceNo);
router.get("/template-pdf", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getInvoiceTemplatePdf);
router.get("/quotation-template-pdf", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getQuotationTemplatePdf);
router.get("/quotation-2-template-pdf", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getQuotation2TemplatePdf);
router.get("/quotation-3-template-pdf", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getQuotation3TemplatePdf);
router.get("/sign1-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSign1Image);
router.get("/sign-q2-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSignQ2Image);
router.get("/sign-q3-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSignQ3Image);
router.get("/signv-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSignVImage);
router.get("/seal1-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSeal1Image);
router.get("/seal-q2-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSealQ2Image);
router.get("/seal-q3-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSealQ3Image);
router.get("/sealv-image", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getSealVImage);
router.get("/warranty-invoices", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.listWarrantyInvoices);
router.get("/", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.listInvoices);
router.get("/:id", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.getInvoice);
router.put("/:id/payment", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.updateInvoicePayment);
router.delete("/:id/payment", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.deleteInvoicePayment);
router.post("/:id/send-email", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.sendInvoiceEmail);
router.post("/", authMiddleware, roleMiddleware(["admin","manager","user"]), invoiceController.createInvoice);
router.delete("/:id", authMiddleware, roleMiddleware(["admin"]), invoiceController.deleteInvoice);

module.exports = router;
