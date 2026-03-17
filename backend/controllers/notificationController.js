const Notification = require("../models/Notification");

exports.getNotifications = async (req,res)=>{
    try{
        const notifications = await Notification.findAll({ order:[["createdAt","DESC"]] });
        res.json(notifications);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to load notifications." });
    }
};

exports.createNotification = async (req,res)=>{
    try{
        const { title, body } = req.body;
        if(!title || !body){
            return res.status(400).json({ message: "Title and notification are required." });
        }
        const created = await Notification.create({ title, body });
        res.status(201).json(created);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to create notification." });
    }
};

exports.deleteNotification = async (req,res)=>{
    try{
        const { id } = req.params;
        const note = await Notification.findByPk(id);
        if(!note){
            return res.status(404).json({ message: "Notification not found." });
        }
        await note.destroy();
        res.json({ message: "Notification deleted successfully." });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to delete notification." });
    }
};
