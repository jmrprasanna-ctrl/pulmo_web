CREATE INDEX IF NOT EXISTS rental_machine_counts_customer_entry_machine_idx
ON rental_machine_counts(customer_id, entry_date, rental_machine_id, id);
