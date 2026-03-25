const { DataTypes } = require("sequelize");
const db = require("../config/database");
const Invoice = require("./Invoice");

const InvoiceImportant = db.define(
  "InvoiceImportant",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    invoice_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: Invoice, key: "id" } },
    line_no: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    note: { type: DataTypes.STRING, allowNull: false },
    warranty_period: { type: DataTypes.STRING, allowNull: true },
    warranty_expiry_date: { type: DataTypes.DATEONLY, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
  },
  { tableName: "invoice_importants", timestamps: true }
);

InvoiceImportant.belongsTo(Invoice, { foreignKey: "invoice_id", onDelete: "CASCADE" });
Invoice.hasMany(InvoiceImportant, { foreignKey: "invoice_id", onDelete: "CASCADE" });

module.exports = InvoiceImportant;
