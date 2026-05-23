const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");
const {
  getBackupStatus,
  downloadBackup,
  restoreBackup,
  getBackupConfig,
  saveBackupConfig,
  startGoogleDriveOAuth,
  handleGoogleDriveOAuthCallback,
  disconnectGoogleDriveOAuth,
  testGoogleDriveConnection,
  syncInvoiceQuotationBackups,
  runDatabaseBackupNow,
  listDatabaseBackupHistory,
} = require("../controllers/systemBackupController");

const router = express.Router();

router.get("/drive/oauth/callback", handleGoogleDriveOAuthCallback);
router.use(authMiddleware, roleMiddleware(["admin"]));
router.get("/status", getBackupStatus);
router.get("/download", downloadBackup);
router.post("/restore", restoreBackup);
router.get("/config", getBackupConfig);
router.put("/config", saveBackupConfig);
router.post("/drive/oauth/start", startGoogleDriveOAuth);
router.post("/drive/oauth/disconnect", disconnectGoogleDriveOAuth);
router.post("/drive/test", testGoogleDriveConnection);
router.post("/sync/invoices", syncInvoiceQuotationBackups);
router.post("/sync/db-now", runDatabaseBackupNow);
router.get("/db-history", listDatabaseBackupHistory);

module.exports = router;
