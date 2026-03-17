const Customer = require("../models/Customer");

const toUpper = (value) => String(value || "").trim().toUpperCase();

exports.getCustomers = async (req,res)=>{
    const customers = await Customer.findAll();
    res.json(customers);
}

exports.getCustomerById = async (req,res)=>{
    const { id } = req.params;
    const customer = await Customer.findByPk(id);
    if(!customer){
        return res.status(404).json({ message: "Customer not found." });
    }
    res.json(customer);
};

exports.createCustomer = async (req,res)=>{
    try{
        const { name, address, quotation2_address, tel, customer_type, customer_mode, vat_number, email } = req.body;
        if(!name){
            return res.status(400).json({ message: "Customer name is required." });
        }
        const created = await Customer.create({
            name: toUpper(name),
            address: toUpper(address),
            quotation2_address: toUpper(quotation2_address),
            tel,
            customer_type,
            customer_mode,
            vat_number,
            email
        });
        res.status(201).json(created);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to add customer." });
    }
};

exports.updateCustomer = async (req,res)=>{
    try{
        const { id } = req.params;
        const { name, address, quotation2_address, tel, customer_type, customer_mode, vat_number, email } = req.body;
        if(!name){
            return res.status(400).json({ message: "Customer name is required." });
        }
        const customer = await Customer.findByPk(id);
        if(!customer){
            return res.status(404).json({ message: "Customer not found." });
        }
        await customer.update({
            name: toUpper(name),
            address: toUpper(address),
            quotation2_address: toUpper(quotation2_address),
            tel,
            customer_type,
            customer_mode,
            vat_number,
            email
        });
        res.json(customer);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to update customer." });
    }
};

exports.deleteCustomer = async (req,res)=>{
    try{
        const { id } = req.params;
        const customer = await Customer.findByPk(id);
        if(!customer){
            return res.status(404).json({ message: "Customer not found." });
        }
        await customer.destroy();
        res.json({ message: "Customer deleted successfully." });
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to delete customer." });
    }
};
