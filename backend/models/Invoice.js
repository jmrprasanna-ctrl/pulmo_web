const { DataTypes } = require("sequelize");
const db = require("../config/database");
const Customer = require("./Customer");

const Invoice = db.define("Invoice",{
    id:{ type: DataTypes.INTEGER, primaryKey:true, autoIncrement:true },
    invoice_no:{ type: DataTypes.STRING, unique:true },
    invoice_date:{ type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    customer_id:{ type: DataTypes.INTEGER, references:{ model:Customer,key:"id" } },
    machine_description:{ type: DataTypes.STRING, allowNull: true },
    serial_no:{ type: DataTypes.STRING, allowNull: true },
    machine_count:{ type: DataTypes.INTEGER, allowNull: true },
    support_technician:{ type: DataTypes.STRING, allowNull: true },
    support_technician_percentage:{ type: DataTypes.FLOAT, allowNull: true },
    payment_method:{ type: DataTypes.STRING, allowNull: true, defaultValue: "Cash" },
    cheque_no:{ type: DataTypes.STRING, allowNull: true },
    payment_status:{ type: DataTypes.STRING, allowNull: false, defaultValue: "Pending" },
    total_amount:{ type: DataTypes.FLOAT, defaultValue:0 },
    createdAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW }
},{tableName:"invoices",timestamps:true});

Invoice.belongsTo(Customer,{foreignKey:"customer_id"});

module.exports = Invoice;
