import frappe

@frappe.whitelist()
def get_monthly_salary_employees(company):
    employees = frappe.get_all(
        "Employee",
        filters={
            "company": company,
            "custom_is_monthly_salary_employee": 1
        },
        fields=["name", "employee_name", "default_shift"]
    )

    for emp in employees:
        # attach shift hours
        if emp.default_shift:
            shift_hours = frappe.db.get_value("Shift Type", emp.default_shift, "custom_total_hours") or 0
            emp["shift_hours"] = shift_hours
        else:
            emp["shift_hours"] = 0

        # fetch salary structure assignment (latest active one)
        ssa = frappe.get_value(
            "Salary Structure Assignment",
            {"employee": emp.name, "docstatus": 1},
            ["base"],
            order_by="from_date desc"
        )

        # attach base salary from assignment
        emp["basic_salary"] = ssa or 0

    return employees


@frappe.whitelist()
def get_employee_attendance(company, start_date, end_date):
    attendance_data = frappe.db.sql("""
        SELECT employee, COUNT(name) as days_present
        FROM `tabAttendance`
        WHERE company = %s
          AND attendance_date BETWEEN %s AND %s
          AND status = 'Present'
        GROUP BY employee
    """, (company, start_date, end_date), as_dict=True)

    return attendance_data





# import frappe
# from frappe.utils import add_days

# @frappe.whitelist()
# def create_additional_salary(payroll_entry_name):
#     """
#     Create Additional Salary for employees with overtime pay > 0
#     for the given Payroll Entry
#     """
#     doc = frappe.get_doc("Payroll Entry", payroll_entry_name)

#     for row in doc.custom_overtime_calculation_table:
#         if row.overtime_pay and row.overtime_pay > 0:
#             additional_salary = frappe.new_doc("Additional Salary")
#             additional_salary.company = doc.company
#             additional_salary.currency = doc.currency
#             additional_salary.payroll_date = add_days(doc.end_date, -1)
#             additional_salary.salary_component = "Overtime"
#             additional_salary.type = "Earning"
#             additional_salary.employee = row.employee
#             additional_salary.employee_name = row.employee_name
#             additional_salary.amount = row.overtime_pay
#             additional_salary.overwrite_salary_structure_amount = 1
#             additional_salary.ref_doctype = "Payroll Entry"
#             additional_salary.ref_docname = doc.name
#             additional_salary.docstatus = 1

#             additional_salary.insert(ignore_permissions=True)
#             row.additional_salary = additional_salary.name

#     doc.save(ignore_permissions=True)
#     frappe.msgprint("Additional Salary created and linked for employees with overtime pay.")


import frappe
from frappe.utils import add_days

@frappe.whitelist()
def create_additional_salary(payroll_entry_name):
    """
    Create Additional Salary for employees with overtime pay > 0
    for the given Payroll Entry.
    Avoids duplicate creation if Additional Salary is already linked.
    """
    doc = frappe.get_doc("Payroll Entry", payroll_entry_name)
    created_count = 0

    for row in doc.custom_overtime_calculation_table:
        # Only create if overtime > 0 AND no additional_salary already linked
        if row.overtime_pay and row.overtime_pay > 0 and not row.additional_salary:
            additional_salary = frappe.new_doc("Additional Salary")
            additional_salary.company = doc.company
            additional_salary.currency = doc.currency
            additional_salary.payroll_date = add_days(doc.end_date, -1)
            additional_salary.salary_component = "Overtime"
            additional_salary.type = "Earning"
            additional_salary.employee = row.employee
            additional_salary.employee_name = row.employee_name
            additional_salary.amount = row.overtime_pay
            additional_salary.overwrite_salary_structure_amount = 1
            additional_salary.custom_payroll_entry = doc.name
            additional_salary.docstatus = 1

            # Save Additional Salary
            additional_salary.insert(ignore_permissions=True)

            # Link back to child table
            # row.additional_salary = additional_salary.name
            # row.db_set("additional_salary", additional_salary.name, update_modified=False)  
            # ensures saved to DB without waiting for parent doc.save()

            created_count += 1

    if created_count > 0:
        # Save parent only if new links were made
        doc.save(ignore_permissions=True)
        frappe.msgprint(f"{created_count} Additional Salary record(s) created and linked successfully.")
    # else:
    #     frappe.msgprint("Additional Salary already created for all employees. No new records added.")

#################################################### TimeSheet Creation from Payroll Entry ####################################################
# import frappe

# @frappe.whitelist()
# def create_timesheet_from_payroll(payroll_entry_name):
#     """
#     Create Timesheet from Payroll Entry Overtime Calculation Table
#     """
#     pr = frappe.get_doc("Payroll Entry", payroll_entry_name)

#     if not pr.custom_overtime_calculation_table:
#         frappe.throw("No employees found in Overtime Calculation Table.")

#     # Create Timesheet
#     ts = frappe.new_doc("Timesheet")
#     ts.company = pr.company
#     ts.currency = pr.currency
#     ts.exchange_rate = pr.exchange_rate
#     ts.total_working_hours = pr.custom_total_working_hours
#     ts.custom_total_billing_hours = pr.custom_total_billing_hours
#     ts.custom_total_overtime_hours = pr.custom_total_overtime_hours

#     # Set start & end dates from Payroll Entry
#     ts.start_date = pr.start_date
#     ts.end_date = pr.end_date

#     total_overtime_billing_amount = 0

#     for row in pr.custom_overtime_calculation_table:
#         # Skip if no employee
#         if not row.employee:
#             continue

#         # Fetch Activity Cost for this employee
#         activity_cost = frappe.db.get_value(
#             "Activity Cost",
#             {"employee": row.employee},
#             ["activity_type", "billing_rate", "costing_rate"],
#             as_dict=True
#         )

#         # Add Timesheet Detail row
#         tst = ts.append("time_logs", {})
#         tst.custom_employee = row.employee
#         tst.custom_employee_name = row.employee_name
#         tst.custom_total_billing_hours = row.employee_total_daily_hours
#         tst.custom_overtime_hrs = row.employee_overtime_hours
#         tst.billing_hours = row.employee_total_working_hours
#         tst.hours = row.employee_total_working_hours
#         tst.is_billable = 1
#         tst.custom_is_monthly_payroll = 1

#         # Set from_time and to_time from Payroll Entry dates
#         tst.custom_from_date = pr.start_date
#         tst.custom_to_date = pr.end_date

#         if activity_cost:
#             tst.activity_type = activity_cost.activity_type
#             tst.billing_rate = activity_cost.billing_rate
#             tst.costing_rate = activity_cost.costing_rate

#         # --- New calculation ---
#         tst.custom_overtime_amount = (tst.billing_rate or 0) * (tst.custom_overtime_hrs or 0)

#         # Add to parent total
#         total_overtime_billing_amount += tst.custom_overtime_amount

#     # Set total in Timesheet parent
#     ts.custom_total_overtime_billing_amount = total_overtime_billing_amount

#     ts.save(ignore_permissions=True)

#     frappe.msgprint(
#         f"Timesheet {ts.name} created successfully "
#         f"with total overtime billing amount {total_overtime_billing_amount}."
#     )
#     return ts.name



import frappe
from frappe.utils import now_datetime

@frappe.whitelist()
def create_timesheet_from_payroll(payroll_entry_name):
    """
    Create Timesheet from Payroll Entry Overtime Calculation Table
    """
    pr = frappe.get_doc("Payroll Entry", payroll_entry_name)

    if not pr.custom_overtime_calculation_table:
        frappe.throw("No employees found in Overtime Calculation Table.")

    # Create Timesheet
    ts = frappe.new_doc("Timesheet")
    ts.company = pr.company
    ts.currency = pr.currency
    ts.exchange_rate = pr.exchange_rate
    ts.total_working_hours = pr.custom_total_working_hours
    ts.custom_total_billing_hours = pr.custom_total_billing_hours
    ts.custom_total_overtime_hours = pr.custom_total_overtime_hours
    ts.custom_is_monthly_payroll_entry = 1

    # Set start & end dates from Payroll Entry
    ts.start_date = pr.start_date
    ts.end_date = pr.end_date
    ts.custom_from_date = pr.start_date
    ts.custom_to_date = pr.end_date

    total_overtime_billing_amount = 0

    for row in pr.custom_overtime_calculation_table:
        # Skip if no employee
        if not row.employee:
            continue

        # Fetch Activity Cost
        activity_cost = frappe.db.get_value(
            "Activity Cost",
            {"employee": row.employee},
            ["activity_type", "billing_rate", "costing_rate"],
            as_dict=True
        )

        # Add Timesheet Detail row
        tst = ts.append("time_logs", {})
        tst.custom_employee = row.employee
        tst.custom_employee_name = row.employee_name
        tst.custom_total_billing_hours = row.employee_total_daily_hours
        tst.custom_overtime_hrs = row.employee_overtime_hours
        tst.billing_hours = row.employee_total_working_hours
        tst.hours = row.employee_total_working_hours
        tst.is_billable = 1
        tst.custom_is_monthly_payroll = 1

        # Set from_time = today, to_time = None
        tst.from_time = now_datetime()
        tst.to_time = None

        # Still keep your custom date fields
        tst.custom_from_date = pr.start_date
        tst.custom_to_date = pr.end_date

        if activity_cost:
            tst.activity_type = activity_cost.activity_type
            tst.billing_rate = activity_cost.billing_rate
            tst.costing_rate = activity_cost.costing_rate

        # --- New calculation ---
        tst.custom_overtime_amount = (tst.billing_rate or 0) * (tst.custom_overtime_hrs or 0)

        # Add to parent total
        total_overtime_billing_amount += tst.custom_overtime_amount

    # Set total in Timesheet parent
    ts.custom_total_overtime_billing_amount = total_overtime_billing_amount

    ts.save(ignore_permissions=True)

    frappe.msgprint(
        f"Timesheet {ts.name} created successfully "
        f"with total overtime billing amount {total_overtime_billing_amount}."
    )
    return ts.name



############################################### Timesheet Currency Rate Method ####################################################


import json

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import add_to_date, flt, get_datetime, getdate, time_diff_in_hours

from erpnext.controllers.queries import get_match_cond
from erpnext.setup.utils import get_exchange_rate

@frappe.whitelist()
def get_timesheet_detail_rate(timelog=None, currency=None):
    if not timelog:
        frappe.throw("Timelog is required")
    
    timelog_detail = frappe.db.sql(
        """
        SELECT tsd.billing_amount as billing_amount,
               ts.currency as currency
        FROM `tabTimesheet Detail` tsd
        INNER JOIN `tabTimesheet` ts ON ts.name=tsd.parent
        WHERE tsd.name = %s
        """,
        (timelog,),
        as_dict=1,
    )[0]

    if currency and timelog_detail.currency:
        exchange_rate = get_exchange_rate(timelog_detail.currency, currency)
        return timelog_detail.billing_amount * exchange_rate
    
    return timelog_detail.billing_amount


############################################# Make Sales from Timesheet ##################################################################

import frappe
from frappe.utils import flt, nowdate
from frappe import _

@frappe.whitelist()
def make_sales_invoice(source_name, item_code=None, customer=None, currency=None):
    target = frappe.new_doc("Sales Invoice")
    timesheet = frappe.get_doc("Timesheet", source_name)

    if not timesheet.total_billable_hours:
        frappe.throw(_("Invoice can't be made for zero billing hour"))

    if timesheet.total_billable_hours == timesheet.total_billed_hours:
        frappe.throw(_("Invoice already created for all billing hours"))

    target.company = timesheet.company
    target.project = timesheet.parent_project
    target.posting_date = nowdate()

    # set customer
    if customer:
        target.customer = customer
    elif timesheet.customer:
        target.customer = timesheet.customer

    # set currency
    if currency:
        target.currency = currency
    elif timesheet.currency:
        target.currency = timesheet.currency

    # Loop through time_logs
    for time_log in timesheet.time_logs:
        if not time_log.is_billable:
            continue

        # --- get rate dynamically from your method ---
        rate = frappe.get_value(
            "Timesheet Detail",
            time_log.name,
            "billing_rate"
        ) or time_log.billing_rate or 0

        # Add to Sales Invoice → Items
        if item_code:
            target.append("items", {
                "item_code": item_code,
                "qty": time_log.billing_hours or 0,
                "rate": rate,
                "description": time_log.activity_type or "",
                "time_sheet": timesheet.name,
                "timesheet_detail": time_log.name
            })

        # Add to Sales Invoice → Timesheets
        target.append("timesheets", {
            "time_sheet": timesheet.name,
            "project_name": time_log.project_name,
            "from_time": time_log.from_time,
            "to_time": time_log.to_time,
            "custom_from_date": time_log.custom_from_date,
            "custom_to_date": time_log.custom_to_date,
            "custom_employee": time_log.custom_employee,
            "custom_employee_name": time_log.custom_employee_name,
            "billing_hours": time_log.billing_hours,
            "billing_amount": time_log.billing_amount,
            "timesheet_detail": time_log.name,
            "activity_type": time_log.activity_type,
            "description": time_log.description,
            "custom_is_monthly_payroll": timesheet.custom_is_monthly_payroll_entry  # ✅ pass parent value
        })

    # run standard methods
    target.run_method("calculate_billing_amount_for_timesheet")
    target.run_method("set_missing_values")

    return target
