// ____________________________________________________________ Daily Overtime Calculation ____________________________________________________________

frappe.ui.form.on("Timesheet Detail", {
    custom_total_billing_hours: function(frm, cdt, cdn) {
        calculate_billing_hours(frm, cdt, cdn);
        update_parent_totals(frm);
    },
    custom_overtime_hrs: function(frm, cdt, cdn) {
        calculate_billing_hours(frm, cdt, cdn);
        update_parent_totals(frm);
    },
    billing_rate: function(frm, cdt, cdn) {
        calculate_billing_hours(frm, cdt, cdn);
        update_parent_totals(frm);
    },
    costing_rate: function(frm, cdt, cdn) {
        calculate_billing_hours(frm, cdt, cdn);
        update_parent_totals(frm);
    },
    custom_overtime_amount: function(frm) {
        update_parent_totals(frm);
    },
    custom_overtime_costing_amount: function(frm) {
        update_parent_totals(frm);
    }
});

function calculate_billing_hours(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let total_billing = flt(row.custom_total_billing_hours) || 0;
    let overtime = flt(row.custom_overtime_hrs) || 0;
    let billing_rate = flt(row.billing_rate) || 0;
    let costing_rate = flt(row.costing_rate) || 0;

    // update hours
    frappe.model.set_value(cdt, cdn, "billing_hours", total_billing + overtime);
    frappe.model.set_value(cdt, cdn, "hours", total_billing + overtime);

    // update overtime amounts
    frappe.model.set_value(cdt, cdn, "custom_overtime_amount", overtime * billing_rate);
    frappe.model.set_value(cdt, cdn, "custom_overtime_costing_amount", overtime * costing_rate);
}

function update_parent_totals(frm) {
    let total_billing_hours = 0;
    let total_overtime_hours = 0;
    let total_overtime_amount = 0;
    let total_overtime_costing = 0;

    (frm.doc.time_logs || frm.doc.timesheet_details || []).forEach(row => {
        total_billing_hours += flt(row.custom_total_billing_hours) || 0;
        total_overtime_hours += flt(row.custom_overtime_hrs) || 0;
        total_overtime_amount += flt(row.custom_overtime_amount) || 0;
        total_overtime_costing += flt(row.custom_overtime_costing_amount) || 0;
    });

    frm.set_value("custom_total_billing_hours", total_billing_hours);
    frm.set_value("custom_total_overtime_hours", total_overtime_hours);
    frm.set_value("custom_total_overtime_billing_amount", total_overtime_amount);
    frm.set_value("custom_total_overtime_costing_amount", total_overtime_costing);
}

// ____________________________________________________________ Create Auto Additional Salary from Timesheet ____________________________________________________________

frappe.ui.form.on("Timesheet", {
    on_submit: function(frm) {
        // Only run if custom_is_monthly_payroll_entry is not selected
        if (!frm.doc.custom_is_monthly_payroll_entry) {
            // Get yesterday's date
            let yesterday = frappe.datetime.add_days(frappe.datetime.get_today(), -1);

            frappe.call({
                method: "frappe.client.insert",
                args: {
                    doc: {
                        doctype: "Additional Salary",
                        company: frm.doc.company,
                        employee: frm.doc.employee,
                        employee_name: frm.doc.employee_name,
                        department: frm.doc.department,
                        salary_component: "Overtime",
                        type: "Earning",
                        currency: frm.doc.currency,
                        custom_timesheet: frm.doc.name,
                        amount: frm.doc.custom_total_overtime_billing_amount,
                        payroll_date: yesterday,  // 👈 set yesterday instead of today
                        overwrite_salary_structure_amount: 1
                    }
                },
                callback: function(r) {
                    if (!r.exc) {
                        frappe.msgprint(__("Additional Salary created: " + r.message.name));
                    }
                }
            });
        }
    }
});


// ____________________________________________ Sales Invoice Button ____________________________________________________________


frappe.ui.form.on("Timesheet", {
    refresh: function(frm) {
        if (frm.doc.custom_is_monthly_payroll_entry) {
            frm.add_custom_button(__('Create Invoice'), function() {
                
                let fields = [
                    {
                        fieldname: "item",
                        label: "Item",
                        fieldtype: "Link",
                        options: "Item",
                        reqd: 1
                    }
                ];

                if (!frm.doc.customer) {
                    fields.push({
                        fieldname: "customer",
                        label: "Customer",
                        fieldtype: "Link",
                        options: "Customer",
                        reqd: 1
                    });
                }

                let d = new frappe.ui.Dialog({
                    title: "Create Sales Invoice",
                    fields: fields,
                    primary_action_label: "Create",
                    primary_action(values) {
                        let customer = frm.doc.customer || values.customer;
                        let item = values.item;

                        frappe.model.with_doctype("Sales Invoice", function() {
                            let si = frappe.model.get_new_doc("Sales Invoice");
                            si.customer = customer;

                            // For each timesheet row, create one item row
                            (frm.doc.time_logs || []).forEach(row => {
                                let item_row = frappe.model.add_child(si, "items");
                                item_row.item_code = item;
                                item_row.qty = row.billing_hours || 0;
                                item_row.rate = row.billing_rate || 0;
                                item_row.description = row.activity_type || "";
                            });

                            // Link timesheet info
                            let ts_row = frappe.model.add_child(si, "timesheets");
                            ts_row.time_sheet = frm.doc.name;

                            frappe.set_route("Form", "Sales Invoice", si.name);
                        });

                        d.hide();
                    }
                });

                d.show();
            });
        }
    }
});