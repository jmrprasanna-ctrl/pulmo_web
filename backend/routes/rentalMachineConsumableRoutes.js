const express = require("express");
const router = express.Router();
const controller = require("../controllers/rentalMachineConsumableController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.get("/", authMiddleware, roleMiddleware(["admin", "manager", "user"]), controller.getConsumables);
router.get("/entry/:entryKey", authMiddleware, roleMiddleware(["admin", "manager", "user"]), controller.getConsumableEntry);
router.post("/batch", authMiddleware, roleMiddleware(["admin", "manager", "user"]), controller.createConsumablesBatch);
router.post("/", authMiddleware, roleMiddleware(["admin", "manager", "user"]), controller.createConsumable);
router.delete("/batch/:save_batch_id", authMiddleware, roleMiddleware(["admin", "manager"]), controller.deleteConsumablesByBatch);
router.delete("/:id", authMiddleware, roleMiddleware(["admin", "manager"]), controller.deleteConsumableById);

module.exports = router;
