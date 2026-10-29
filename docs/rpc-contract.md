# Kivu Solutions — Supabase RPC Contract

Generated: 2026-10-29T16:47:39.033Z
Total Distinct RPCs: 55

| # | RPC Name | Call Count in app.js | Expected Parameter Keys |
|---|---|---|---|
| 1 | `claim_staff_invite` | 1 | `p_code, p_full_name` |
| 2 | `close_shift_controlled` | 1 | `p_shift_id, p_actual_cash, p_variance_reason` |
| 3 | `create_owner_shop` | 1 | `p_shop_name, p_full_name` |
| 4 | `create_staff_invite` | 1 | `p_employee_name, p_phone, p_role` |
| 5 | `duka_add_shop_note` | 1 | `p_shop_id, p_note` |
| 6 | `duka_admin_overview` | 1 | `(none)` |
| 7 | `duka_admin_overview_v41` | 1 | `(none)` |
| 8 | `duka_admin_profile` | 1 | `(none)` |
| 9 | `duka_admin_shops` | 1 | `(none)` |
| 10 | `duka_admin_shops_v41` | 1 | `(none)` |
| 11 | `duka_app_status` | 2 | `(none)` |
| 12 | `duka_confirm_subscription_payment` | 1 | `p_shop_id, p_amount, p_plan, p_payment_method, p_reference, p_covered_from, p_covered_to, p_note` |
| 13 | `duka_create_ticket` | 1 | `p_shop_id, p_subject, p_description, p_priority` |
| 14 | `duka_list_admins` | 1 | `(none)` |
| 15 | `duka_manage_admin` | 1 | `p_email, p_role, p_province, p_district, p_display_name, p_active` |
| 16 | `duka_platform_audit` | 1 | `p_limit` |
| 17 | `duka_set_app_status` | 1 | `p_maintenance, p_message, p_current_version, p_minimum_version` |
| 18 | `duka_set_feature_flag` | 1 | `p_shop_id, p_key, p_enabled, p_note` |
| 19 | `duka_set_onboarding_status` | 1 | `p_shop_id, p_status, p_reason` |
| 20 | `duka_set_shop_suspension` | 1 | `p_shop_id, p_suspended, p_reason` |
| 21 | `duka_shop_support_view` | 1 | `p_shop_id` |
| 22 | `duka_update_ticket` | 1 | `p_ticket_id, p_status, p_resolution` |
| 23 | `generate_subscription_notifications` | 2 | `(none)` |
| 24 | `hospitality_add_item` | 1 | `p_tab_id, p_product_id, p_qty, p_note, p_complimentary` |
| 25 | `hospitality_close_tab` | 1 | `p_tab_id, p_payments` |
| 26 | `hospitality_mark_served` | 1 | `p_item_id` |
| 27 | `hospitality_open_tab` | 2 | `p_table_id, p_label, p_customer_name` |
| 28 | `hospitality_record_wastage` | 1 | `p_product_id, p_qty, p_reason` |
| 29 | `hospitality_replace_recipe` | 1 | `p_menu_product_id, p_components` |
| 30 | `hospitality_request_complimentary` | 1 | `p_tab_id, p_product_id, p_qty, p_note, p_reason` |
| 31 | `hospitality_save_table` | 1 | `p_table_id, p_name, p_seats, p_active` |
| 32 | `hospitality_send_tab` | 1 | `p_tab_id` |
| 33 | `is_duka_admin` | 1 | `(none)` |
| 34 | `receive_stock` | 1 | `p_product_id, p_qty, p_total_cost` |
| 35 | `record_expense` | 2 | `p_description, p_amount, p_category` |
| 36 | `record_sale_cart_v48` | 4 | `p_items, p_payment, p_discount, p_customer_id, p_customer_name, p_client_ref` |
| 37 | `record_supplier_payment` | 1 | `p_supplier_id, p_amount, p_payment_method, p_note` |
| 38 | `record_supplier_purchase_v44` | 1 | `p_supplier_id, p_items, p_amount_paid, p_payment_method, p_invoice_no, p_due_date, p_note` |
| 39 | `register_app_device` | 1 | `p_device_key, p_device_label, p_app_version` |
| 40 | `remove_customer_safe` | 1 | `p_customer_id` |
| 41 | `remove_supplier_safe` | 1 | `p_supplier_id` |
| 42 | `request_or_adjust_stock` | 1 | `p_product_id, p_qty_delta, p_reason` |
| 43 | `request_or_void_sale` | 1 | `p_sale_id, p_reason` |
| 44 | `request_plan_change` | 1 | `p_plan` |
| 45 | `restore_app_device` | 1 | `p_device_id` |
| 46 | `review_control_request` | 1 | `p_request_id, p_decision` |
| 47 | `revoke_app_device` | 1 | `p_device_id, p_reason` |
| 48 | `set_employee_active` | 1 | `p_employee_id, p_active` |
| 49 | `update_customer_details` | 1 | `p_customer_id, p_name, p_phone, p_email` |
| 50 | `update_product_barcode` | 1 | `p_product_id, p_barcode` |
| 51 | `update_product_details_v44` | 1 | `p_product_id, p_name, p_price, p_low_stock, p_preferred_supplier_id, p_cost, p_base_unit, p_bulk_unit, p_units_per_bulk, p_expiry_date, p_expiry_reminder_days` |
| 52 | `update_shop_profile_v41` | 1 | `p_name, p_province, p_district, p_sector, p_cell, p_language` |
| 53 | `update_shop_settings_v486` | 1 | `p_name, p_phone, p_receipt_footer, p_business_type` |
| 54 | `update_shop_tax_settings` | 1 | `p_tax_rate, p_tax_label, p_tax_number` |
| 55 | `update_supplier_details` | 1 | `p_supplier_id, p_name, p_phone, p_address, p_notes` |
