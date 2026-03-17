const Todo = require("../models/Todo");
const User = require("../models/User");
const { Op } = require("sequelize");

async function attachDoneByNames(todos){
    const rows = Array.isArray(todos) ? todos : [];
    const doneByIds = [...new Set(
        rows
            .map((t) => Number(t.done_by))
            .filter((id) => Number.isFinite(id) && id > 0)
    )];

    if(!doneByIds.length){
        return rows.map((t) => ({ ...t.toJSON(), done_by_name: null }));
    }

    const users = await User.findAll({
        where: { id: doneByIds },
        attributes: ["id", "username", "email"]
    });
    const userMap = new Map(users.map((u) => [Number(u.id), u.username || u.email || `User ${u.id}`]));

    return rows.map((t) => {
        const json = t.toJSON();
        const doneById = Number(json.done_by);
        return {
            ...json,
            done_by_name: userMap.get(doneById) || null
        };
    });
}

exports.getTodos = async (req,res)=>{
    try{
        const role = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : "";
        const where = {};
        if(role === "user"){
            where[Op.or] = [
                { assigned_to: req.user.id },
                { created_by: req.user.id }
            ];
        }
        const todos = await Todo.findAll({ where, order:[["createdAt","DESC"]] });
        const enriched = await attachDoneByNames(todos);
        res.json(enriched);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to load todos." });
    }
};

exports.createTodo = async (req,res)=>{
    const { title, assigned_to } = req.body;
    if(!title || !String(title).trim()){
        return res.status(400).json({ message: "Title is required" });
    }
    try{
        let assigned = assigned_to;
        if(!assigned){
            assigned = req.user ? req.user.id : null;
        }
        const todo = await Todo.create({
            title: String(title).trim(),
            created_by: req.user ? req.user.id : null,
            assigned_to: assigned
        });
        res.json(todo);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to create todo." });
    }
};

exports.updateTodo = async (req,res)=>{
    const { id } = req.params;
    try{
        const todo = await Todo.findByPk(id);
        if(!todo) return res.status(404).json({ message: "Todo not found" });

        const role = (req.user && req.user.role) ? String(req.user.role).toLowerCase() : "";
        const { title, done } = req.body || {};

        if(role === "user"){
            const assignedToCurrentUser = Number(todo.assigned_to) === Number(req.user.id);
            const createdByCurrentUser = Number(todo.created_by) === Number(req.user.id);
            if(!assignedToCurrentUser && !createdByCurrentUser){
                return res.status(403).json({ message: "Forbidden: Insufficient permissions" });
            }
            if(typeof done === "undefined"){
                return res.status(400).json({ message: "Done status required" });
            }
            todo.done = Boolean(done);
            todo.done_by = todo.done ? (req.user ? req.user.id : null) : null;
            await todo.save();
            const enriched = await attachDoneByNames([todo]);
            return res.json(enriched[0]);
        }

        if(typeof title !== "undefined"){
            const clean = String(title).trim();
            if(!clean) return res.status(400).json({ message: "Title is required" });
            todo.title = clean;
        }
        if(typeof done !== "undefined"){
            todo.done = Boolean(done);
            todo.done_by = todo.done ? (req.user ? req.user.id : null) : null;
        }
        await todo.save();
        const enriched = await attachDoneByNames([todo]);
        res.json(enriched[0]);
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to update todo." });
    }
};

exports.deleteTodo = async (req,res)=>{
    const { id } = req.params;
    try{
        const todo = await Todo.findByPk(id);
        if(!todo) return res.status(404).json({ message: "Todo not found" });
        await Todo.destroy({ where:{ id } });
        res.json({ message: "Todo deleted" });
    }catch(err){
        console.error(err);
        res.status(500).json({ message: err.message || "Failed to delete todo." });
    }
};
