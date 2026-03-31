const { DataTypes } = require("sequelize");
const db = require("../config/database");

const UiSetting = db.define(
  "UiSetting",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    app_name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "PULMO TECHNOLOGIES" },
    footer_text: {
      type: DataTypes.STRING(255),
      allowNull: false,
      defaultValue: "\u00A9 All Right Recieved with CRONIT SOLLUTIONS - JMR Prasanna.",
    },
    primary_color: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "#0f6abf" },
    accent_color: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "#11a36f" },
    background_color: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "#edf3fb" },
    button_color: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "#0f6abf" },
    mode_theme: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "light" },
    logo_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    invoice_template_pdf_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    quotation_template_pdf_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    quotation2_template_pdf_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    quotation3_template_pdf_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    sign_c_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    sign_v_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    seal_c_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    seal_v_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    sign_q2_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    seal_q2_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    sign_q3_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    seal_q3_path: { type: DataTypes.STRING(500), allowNull: true, defaultValue: null },
    createdAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
  },
  { tableName: "ui_settings", timestamps: true }
);

module.exports = UiSetting;

