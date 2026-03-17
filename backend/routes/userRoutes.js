const express = require("express");
const { getUsers, getUserById, addUser, updateUser, deleteUser } = require("../controllers/userController");
const {
  getAccessPages,
  getDatabases,
  getUserAccess,
  saveUserAccess,
  getMyAccess
} = require("../controllers/userAccessController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/assignable", roleMiddleware(["admin","manager"]), getUsers);
router.get("/access/me", getMyAccess);

router.use(roleMiddleware(["admin"]));

router.get("/access-pages", getAccessPages);
router.get("/databases", getDatabases);
router.get("/access/:userId", getUserAccess);
router.put("/access/:userId", saveUserAccess);
router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/", addUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
