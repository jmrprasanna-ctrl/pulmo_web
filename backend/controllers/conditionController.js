const Condition = require("../models/Condition");

exports.getConditions = async (req,res)=>{
    const conditions = await Condition.findAll();
    res.json(conditions);
}

exports.addCondition = async (req,res)=>{
    const { condition } = req.body;
    if(!condition) return res.status(400).json({message:"Condition required"});
    const newCond = await Condition.create({condition});
    res.json(newCond);
}

exports.updateCondition = async (req,res)=>{
    const { id } = req.params;
    const { condition } = req.body;
    const cond = await Condition.findByPk(id);
    if(!cond) return res.status(404).json({message:"Condition not found"});
    cond.condition = condition;
    await cond.save();
    res.json(cond);
}

exports.deleteCondition = async (req,res)=>{
    const { id } = req.params;
    const cond = await Condition.findByPk(id);
    if(!cond) return res.status(404).json({message:"Condition not found"});
    await cond.destroy();
    res.json({message:"Deleted"});
};
