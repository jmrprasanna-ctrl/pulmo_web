const express = require("express");
const { getUsers, getUserById, addUser, updateUser, deleteUser } = require("../controllers/userController");
const {
  getAccessUsers,
  getAccessPages,
  getDatabases,
  createDatabase,
  getCreatedDatabases,
  deleteDatabase,
  getCompanies,
  createCompany,
  deleteCompany,
  getUserAccess,
  saveUserAccess,
  getMyAccess
} = require("../controllers/userAccessController");
const { getLoginLogs, clearLoginLogs } = require("../controllers/userLogController");
const authMiddleware = require("../middleware/authMiddleware");
const roleMiddleware = require("../middleware/roleMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/assignable", roleMiddleware(["admin","manager","user"]), getUsers);
router.get("/access/me", getMyAccess);

router.use(roleMiddleware(["admin"]));

router.get("/access-users", getAccessUsers);
router.get("/access-pages", getAccessPages);
router.get("/databases", getDatabases);
router.post("/databases/create", createDatabase);
router.get("/databases/created", getCreatedDatabases);
router.delete("/databases/:databaseName", deleteDatabase);
router.get("/companies", getCompanies);
router.post("/companies/create", createCompany);
router.delete("/companies/:companyId", deleteCompany);
router.get("/logs", getLoginLogs);
router.delete("/logs", clearLoginLogs);
router.get("/access/:userId", getUserAccess);
router.put("/access/:userId", saveUserAccess);
router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/", addUser);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
