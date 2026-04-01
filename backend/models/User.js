const { DataTypes } = require("sequelize");
const db = require("../config/database");

const User = db.define("User", {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING, allowNull: false },
    company: { type: DataTypes.STRING },
    department: { type: DataTypes.STRING },
    telephone: { type: DataTypes.STRING },
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
                                                                       
    role: { type: DataTypes.STRING, defaultValue: "user" },
    is_super_user: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    password: { type: DataTypes.STRING, allowNull: false },
    password_plain: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
                                                                              
    createdAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW }
},{tableName:"users",timestamps:true});

module.exports = User;
