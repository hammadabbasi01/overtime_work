// ____________________________________________________ Payroll Entry Overtime Calculation ____________________________________________________

frappe.ui.form.on("Payroll Entry", {
    onload: function(frm) {
        if (frm.is_new() && frm.doc.company) {
            if (frm.doc.salary_slip_based_on_timesheet) {
                // If salary slip is based on timesheet → clear table
                frm.clear_table("custom_overtime_calculation_table");
                frm.refresh_field("custom_overtime_calculation_table");
            } else {
                // Otherwise fetch employees
                frappe.call({
                    method: "overtime_work.payroll_employee_overtime.get_monthly_salary_employees",
                    args: {
                        company: frm.doc.company
                    },
                    callback: function(r) {
                        if (r.message) {
                            frm.clear_table("custom_overtime_calculation_table");

                            r.message.forEach(emp => {
                                let row = frm.add_child("custom_overtime_calculation_table");
                                row.employee = emp.name;
                                row.employee_name = emp.employee_name;
                                row.shift_hours = emp.shift_hours || 0;
                                row.basic_salary = emp.basic_salary || 0;
                            });

                            frm.refresh_field("custom_overtime_calculation_table");
                        }
                    }
                });
            }
        }
    },

    salary_slip_based_on_timesheet: function(frm) {
        if (frm.doc.salary_slip_based_on_timesheet) {
            frm.clear_table("custom_overtime_calculation_table");
            frm.refresh_field("custom_overtime_calculation_table");
        } else {
            // Re-fetch employees if unchecked
            if (frm.doc.company) {
                frappe.call({
                    method: "overtime_work.payroll_employee_overtime.get_monthly_salary_employees",
                    args: {
                        company: frm.doc.company
                    },
                    callback: function(r) {
                        if (r.message) {
                            frm.clear_table("custom_overtime_calculation_table");

                            r.message.forEach(emp => {
                                let row = frm.add_child("custom_overtime_calculation_table");
                                row.employee = emp.name;
                                row.employee_name = emp.employee_name;
                                row.shift_hours = emp.shift_hours || 0;
                                row.basic_salary = emp.basic_salary || 0;
                            });

                            frm.refresh_field("custom_overtime_calculation_table");
                        }
                    }
                });
            }
        }
    },

    start_date: function(frm) {
        if (frm.doc.start_date && frm.doc.end_date && frm.doc.company) {
            fetch_attendance_days(frm);
        }
    },

    end_date: function(frm) {
        if (frm.doc.start_date && frm.doc.end_date && frm.doc.company) {
            fetch_attendance_days(frm);
        }
    }
});


// frappe.ui.form.on("Payroll Entry", {
//     onload: function(frm) {
//         if (frm.is_new() && frm.doc.company) {
//             frappe.call({
//                 method: "overtime_work.payroll_employee_overtime.get_monthly_salary_employees",
//                 args: {
//                     company: frm.doc.company
//                 },
//                 callback: function(r) {
//                     if (r.message) {
//                         frm.clear_table("custom_overtime_calculation_table");

//                         r.message.forEach(emp => {
//                             let row = frm.add_child("custom_overtime_calculation_table");
//                             row.employee = emp.name;
//                             row.employee_name = emp.employee_name;
//                             row.shift_hours = emp.shift_hours || 0; // store shift hours
//                             row.basic_salary = emp.basic_salary || 0;
//                         });

//                         frm.refresh_field("custom_overtime_calculation_table");
//                     }
//                 }
//             });
//         }
//     },

//     start_date: function(frm) {
//         if (frm.doc.start_date && frm.doc.end_date && frm.doc.company) {
//             fetch_attendance_days(frm);
//         }
//     },

//     end_date: function(frm) {
//         if (frm.doc.start_date && frm.doc.end_date && frm.doc.company) {
//             fetch_attendance_days(frm);
//         }
//     }
// });

// Trigger when overtime hours are typed in child table
frappe.ui.form.on("Overtime Calculation Table", {
    employee_overtime_hours: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];
        let daily_hours = flt(row.employee_total_daily_hours) || 0;
        let overtime_hours = flt(row.employee_overtime_hours) || 0;

        // total working = daily hours + overtime hours
        row.employee_total_working_hours = daily_hours + overtime_hours;
        
        calculate_overtime_pay(row);

        frm.refresh_field("custom_overtime_calculation_table");

        // recalc parent totals
        calculate_parent_totals(frm);
    },
    overtime_multiplier: function(frm, cdt, cdn) {
        let row = locals[cdt][cdn];

        // recalc overtime pay when multiplier changes
        calculate_overtime_pay(row);

        frm.refresh_field("custom_overtime_calculation_table");
    }
});


function fetch_attendance_days(frm) {
    frappe.call({
        method: "overtime_work.payroll_employee_overtime.get_employee_attendance",
        args: {
            company: frm.doc.company,
            start_date: frm.doc.start_date,
            end_date: frm.doc.end_date
        },
        callback: function(r) {
            if (r.message) {
                let attendance_map = {};
                r.message.forEach(row => {
                    attendance_map[row.employee] = row.days_present;
                });

                (frm.doc.custom_overtime_calculation_table || []).forEach(d => {
                    d.attendance_days = attendance_map[d.employee] || 0;

                    // calculate total daily hours = attendance_days * shift_hours
                    d.employee_total_daily_hours = (d.attendance_days || 0) * (d.shift_hours || 0);

                    // update total working hours = daily + overtime
                    let overtime = flt(d.employee_overtime_hours) || 0;
                    d.employee_total_working_hours = d.employee_total_daily_hours + overtime;
                    
                    if (d.employee_total_daily_hours > 0) {
                        d.hourly_rate = flt(d.basic_salary) / d.employee_total_daily_hours;
                    } else {
                        d.hourly_rate = 0;
                    }
                    
                    if (d.hourly_rate > 0 && d.overtime_multiplier > 0) {
                        d.overtime_pay = flt(d.hourly_rate) * flt(d.overtime_multiplier);
                    } else {
                        d.overtime_pay = 0;
                    }
                    
                });

                frm.refresh_field("custom_overtime_calculation_table");

                // update parent totals
                calculate_parent_totals(frm);
            }
        }
    });
}

function calculate_parent_totals(frm) {
    let total_working = 0;
    let total_overtime = 0;
    let total_billing = 0;

    (frm.doc.custom_overtime_calculation_table || []).forEach(d => {
        total_working += flt(d.employee_total_working_hours) || 0;
        total_overtime += flt(d.employee_overtime_hours) || 0;
        total_billing += flt(d.employee_total_daily_hours) || 0;
    });

    frm.set_value("custom_total_working_hours", total_working);
    frm.set_value("custom_total_overtime_hours", total_overtime);
    frm.set_value("custom_total_billing_hours", total_billing);
}

function calculate_overtime_pay(row) {
    if (flt(row.hourly_rate) > 0 && flt(row.overtime_multiplier) > 0 && flt(row.employee_overtime_hours) > 0) {
        row.overtime_pay = flt(row.hourly_rate) * flt(row.overtime_multiplier) * flt(row.employee_overtime_hours);
    } else {
        row.overtime_pay = 0;
    }
}



frappe.ui.form.on('Payroll Entry', {
    after_save: function(frm) {
        frappe.call({
            method: "overtime_work.payroll_employee_overtime.create_additional_salary",
            args: {
                payroll_entry_name: frm.doc.name
            },
            callback: function(r) {
                if (!r.exc) {
                    // frappe.msgprint("Additional Salary created successfully!");
                }
                frm.reload();
            }
        });
    }
});




// CREATE Timesheet
frappe.ui.form.on("Payroll Entry", {
    refresh: function(frm) {
        if (!frm.is_new()) {
            frm.add_custom_button("Create Timesheet", function() {
                frappe.call({
                    method: "overtime_work.payroll_employee_overtime.create_timesheet_from_payroll",
                    args: {
                        payroll_entry_name: frm.doc.name
                    },
                    callback: function(r) {
                        if (!r.exc && r.message) {
                            frappe.set_route("Form", "Timesheet", r.message);
                        }
                    }
                });
            });
        }
    }
});
