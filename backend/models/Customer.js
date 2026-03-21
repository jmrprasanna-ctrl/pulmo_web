const { DataTypes } = require("sequelize");
const db = require("../config/database");

const Customer = db.define("Customer",{
    id:{ type: DataTypes.INTEGER, primaryKey:true, autoIncrement:true },
    customer_id:{ type: DataTypes.STRING, allowNull:true, unique:true },
    name:{ type: DataTypes.STRING, allowNull:false },
    address:{ type: DataTypes.STRING },
    quotation2_address:{ type: DataTypes.STRING, allowNull: true },
    tel:{ type: DataTypes.STRING },
    contact_person:{ type: DataTypes.STRING, allowNull: true },
    customer_type:{ type: DataTypes.STRING, defaultValue:"Silver" },
    customer_mode:{ type: DataTypes.STRING, defaultValue:"General" },
    vat_number:{ type: DataTypes.STRING, allowNull:true },
    email:{ type: DataTypes.STRING, allowNull:false, unique:true },
    createdAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW }
},{tableName:"customers",timestamps:true});

module.exports = Customer;
