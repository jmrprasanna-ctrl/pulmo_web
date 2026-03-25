const express = require("express");
const router = express.Router();
const messageController = require("../controllers/messageController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

router.use(authMiddleware);

router.get("/", roleMiddleware(["admin","manager","user"]), messageController.getMessages);
router.post("/", roleMiddleware(["admin","manager","user"]), messageController.createMessage);
router.delete("/:id", roleMiddleware(["admin","manager","user"]), messageController.deleteMessage);

module.exports = router;
