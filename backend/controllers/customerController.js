const Customer = require("../models/Customer");
const db = require("../config/database");
const { generateNextCustomerCode } = require("../utils/customerCodeGenerator");

const toUpper = (value) => String(value || "").trim().toUpperCase();

function isCustomerIdUniqueConflict(error) {
    if (!error || error.name !== "SequelizeUniqueConstraintError") return false;
    return Array.isArray(error.errors) && error.errors.some((e) =>
        String(e.path || "").toLowerCase() === "customer_id"
    );
}

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
        const { name, address, quotation2_address, tel, contact_person, customer_type, customer_mode, vat_number, email } = req.body;
        if(!name){
            return res.status(400).json({ message: "Customer name is required." });
        }
        const normalizedName = toUpper(name);
        const normalizedAddress = toUpper(address);
        const normalizedQuotation2Address = toUpper(quotation2_address);
        const normalizedContactPerson = String(contact_person || "").trim();

        let created = null;
        for (let attempt = 0; attempt < 5; attempt += 1) {
            try {
                created = await db.transaction(async (transaction) => {
                    const customerCode = await generateNextCustomerCode({
                        customerName: normalizedName,
                        CustomerModel: Customer,
                        transaction,
                    });
                    return Customer.create({
                        customer_id: customerCode,
                        name: normalizedName,
                        address: normalizedAddress,
                        quotation2_address: normalizedQuotation2Address,
                        tel,
                        contact_person: normalizedContactPerson || null,
                        customer_type,
                        customer_mode,
                        vat_number,
                        email
                    }, { transaction });
                });
                break;
            } catch (err) {
                if (!isCustomerIdUniqueConflict(err) || attempt === 4) {
                    throw err;
                }
            }
        }

        res.status(201).json(created);
    }catch(err){
        res.status(500).json({ message: err.message || "Failed to add customer." });
    }
};

exports.updateCustomer = async (req,res)=>{
    try{
        const { id } = req.params;
        const { name, address, quotation2_address, tel, contact_person, customer_type, customer_mode, vat_number, email } = req.body;
        if(!name){
            return res.status(400).json({ message: "Customer name is required." });
        }
        await db.transaction(async (transaction) => {
            const customerForUpdate = await Customer.findByPk(id, { transaction });
            if(!customerForUpdate){
                throw new Error("Customer not found.");
            }

            let customerCode = customerForUpdate.customer_id;
            if(!customerCode){
                customerCode = await generateNextCustomerCode({
                    customerName: name,
                    CustomerModel: Customer,
                    transaction,
                    excludeCustomerPk: id,
                });
            }

            await customerForUpdate.update({
                customer_id: customerCode,
                name: toUpper(name),
                address: toUpper(address),
                quotation2_address: toUpper(quotation2_address),
                tel,
                contact_person: String(contact_person || "").trim() || null,
                customer_type,
                customer_mode,
                vat_number,
                email
            }, { transaction });
        });
        const updatedCustomer = await Customer.findByPk(id);
        res.json(updatedCustomer);
    }catch(err){
        if (String(err.message || "") === "Customer not found.") {
            return res.status(404).json({ message: "Customer not found." });
        }
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
