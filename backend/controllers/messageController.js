const Message = require("../models/Message");
const User = require("../models/User");
const { Op } = require("sequelize");

exports.getMessages = async (req,res)=>{
    try{
        const where = {};
        if(req.user && req.user.role === "user"){
            where[Op.or] = [
                { to_user_id: req.user.id },
                { to_user_id: null }
            ];
        }else if(req.query.to_user_id){
            where.to_user_id = req.query.to_user_id;
        }
        const messages = await Message.findAll({ where, order:[["createdAt","DESC"]] });
        const userIds = new Set();
        messages.forEach(m => {
            if(m.from_user_id) userIds.add(m.from_user_id);
            if(m.to_user_id) userIds.add(m.to_user_id);
        });
        const users = userIds.size
            ? await User.findAll({ where: { id: Array.from(userIds) }, attributes: ["id","username","email"] })
            : [];
        const userMap = {};
        users.forEach(u => {
            userMap[u.id] = u.username || u.email || `User ${u.id}`;
        });
        const rows = messages.map(m => ({
            ...m.toJSON(),
            from_name: m.from_user_id ? (userMap[m.from_user_id] || `User ${m.from_user_id}`) : "System",
            to_name: m.to_user_id ? (userMap[m.to_user_id] || `User ${m.to_user_id}`) : "All Users",
        }));
        res.json(rows);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load messages." });
    }
};

exports.createMessage = async (req,res)=>{
    try{
        const { title, body, to_user_id } = req.body;
        if(!title || !body || !to_user_id){
            return res.status(400).json({ message: "To, title, and message are required." });
        }
        const created = await Message.create({ title, body, to_user_id, from_user_id: req.user?.id || null });
        res.status(201).json(created);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to create message." });
    }
};

exports.deleteMessage = async (req,res)=>{
    try{
        const { id } = req.params;
        const msg = await Message.findByPk(id);
        if(!msg){
            return res.status(404).json({ message: "Message not found." });
        }
        if(req.user && String(req.user.role || "").toLowerCase() === "user"){
            const isOwn = String(msg.to_user_id || "") === String(req.user.id || "");
            const isBroadcast = msg.to_user_id === null;
            if(!isOwn && !isBroadcast){
                return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
            }
        }
        await msg.destroy();
        res.json({ message: "Message deleted successfully." });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to delete message." });
    }
};
