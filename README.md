# pulmotech_inhouse

A **Full-Stack IT Inventory and POS Management System** with modern Franchised UI, including:

- Product Management
- Customer Management
- POS Billing & Invoice PDF
- Quotation Management
- Dashboard with Charts
- Reports
- Multi-user Roles (Admin / Cashier)

---

## 📂 Project Structure


pulmotech_inhouse/
│
├── backend/
│ ├── config/
│ │ db.js
│ ├── controllers/
│ │ authController.js
│ │ productController.js
│ │ customerController.js
│ │ invoiceController.js
│ │ quotationController.js
│ │ reportController.js
│ ├── routes/
│ │ authRoutes.js
│ │ productRoutes.js
│ │ customerRoutes.js
│ │ invoiceRoutes.js
│ │ quotationRoutes.js
│ │ reportRoutes.js
│ ├── services/
│ │ pdfService.js
│ │ emailService.js
│ ├── middleware/
│ │ authMiddleware.js
│ └── server.js
│
├── frontend/
│ ├── css/
│ │ style.css
│ ├── js/
│ │ app.js
│ │ invoice.js
│ │ dashboard.js
│ ├── pages/
│ │ login.html
│ │ dashboard.html
│ │ products.html
│ │ customers.html
│ │ invoice.html
│ │ quotation.html
│ │ reports.html
│ └── components/
│ sidebar.html
│ navbar.html
│
├── database/
│ inventory.sql
├── package.json
└── README.md


---

## ⚙️ Features

- **Authentication:** JWT-based login with Admin/Cashier roles
- **Product Management:** Add, delete, view products, live stock update
- **Customer Management:** Add, delete, view customers
- **POS Billing:** Add products to cart, generate invoice, save PDF
- **Quotations:** Create quotations for customers
- **Dashboard:** Analytics cards, daily sales chart, stock report
- **Reports:** Daily sales and stock reports
- **Modern Franchised UI:** Responsive, clean, professional

---

## 💻 Technology Stack

- **Frontend:** HTML, CSS, JavaScript  
- **Backend:** Node.js, Express.js  
- **Database:** MySQL  
- **Authentication:** JWT + bcryptjs  
- **Services:** PDFKit for invoice, Nodemailer for email  
- **Charts:** Chart.js for analytics  
- **Package Manager:** npm  

---

## 🚀 Installation

1. Clone the repository:

```bash
🚀 Installation

1. Clone the repository:

```bash
git clone https://github.com/jmrprasanna-ctrl/pulmo_web.git
cd pulmo_web

## AWS Server Commands

Use these scripts on your EC2 Ubuntu server:

```bash
# 1) System check
bash deploy/ubuntu24/aws_system_check.sh

# 2) Update app from git + restart PM2
bash deploy/ubuntu24/aws_update.sh main

# Optional: remove system sample/test data from inventory + demo DB while updating
RUN_DB_CLEANUP=true bash deploy/ubuntu24/aws_update.sh main
```

Legacy command still works:

```bash
bash deploy.sh main
```
