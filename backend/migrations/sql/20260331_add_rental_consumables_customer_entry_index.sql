CREATE INDEX IF NOT EXISTS rental_machine_consumables_customer_entry_idx
ON rental_machine_consumables(customer_id, entry_date, id);
