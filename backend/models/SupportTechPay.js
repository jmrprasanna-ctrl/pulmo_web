const { DataTypes } = require("sequelize");
const db = require("../config/database");
const Invoice = require("./Invoice");

const SupportTechPay = db.define(
  "SupportTechPay",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    invoice_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      references: { model: Invoice, key: "id" },
    },
    vendor_pay_amount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    support_tech_pay_amount: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    payment_method: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "Cash" },
    payment_status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: "Pending" },
    payment_proof_image_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    payment_proof_pdf_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    paid_at: { type: DataTypes.DATEONLY, allowNull: true, defaultValue: null },
    createdAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
  },
  { tableName: "support_tech_pays", timestamps: true }
);

SupportTechPay.belongsTo(Invoice, { foreignKey: "invoice_id" });
Invoice.hasOne(SupportTechPay, { foreignKey: "invoice_id" });

module.exports = SupportTechPay;
