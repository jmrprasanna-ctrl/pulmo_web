const { Sequelize } = require("sequelize");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const db = new Sequelize(
  process.env.DB_NAME || "inventory",
  process.env.DB_USER || "postgres",
  process.env.DB_PASSWORD || "",
  {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    dialect: "postgres",
    logging: false,
  }
);

module.exports = db;
