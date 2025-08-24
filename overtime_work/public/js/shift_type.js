// _______________________________________________________ Calculate Total Hours in Shift Type ______________________________________________________

frappe.ui.form.on("Shift Type", {
    start_time: function(frm) {
        calculate_total_hours(frm);
    },
    end_time: function(frm) {
        calculate_total_hours(frm);
    }
});

function calculate_total_hours(frm) {
    if (frm.doc.start_time && frm.doc.end_time) {
        // Convert to Date objects
        let start = moment(frm.doc.start_time, "HH:mm:ss");
        let end = moment(frm.doc.end_time, "HH:mm:ss");

        // Handle case when end_time is on the next day
        if (end.isBefore(start)) {
            end.add(1, "day");
        }

        // Calculate duration in hours
        let duration = moment.duration(end.diff(start));
        let hours = duration.asHours();

        frm.set_value("custom_total_hours", hours);
    } else {
        frm.set_value("custom_total_hours", 0);
    }
}
