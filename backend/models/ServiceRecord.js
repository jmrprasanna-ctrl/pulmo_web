const { DataTypes } = require("sequelize");
const db = require("../config/database");
const Customer = require("./Customer");

const ServiceRecord = db.define(
  "ServiceRecord",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    service_date: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    service_type: { type: DataTypes.STRING, allowNull: false, defaultValue: "general" },
    service_mode: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: Customer, key: "id" },
    },
    customer_name: { type: DataTypes.STRING, allowNull: true },
    machine_ref_id: { type: DataTypes.INTEGER, allowNull: true },
    machine_code: { type: DataTypes.STRING, allowNull: true },
    machine_title: { type: DataTypes.STRING, allowNull: true },
    service_spare: { type: DataTypes.STRING, allowNull: true },
    service_note: { type: DataTypes.TEXT, allowNull: true },
    counter_value: { type: DataTypes.STRING, allowNull: true },
    comment_text: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
  },
  { tableName: "service_records", timestamps: true }
);

ServiceRecord.belongsTo(Customer, { foreignKey: "customer_id" });

module.exports = ServiceRecord;
