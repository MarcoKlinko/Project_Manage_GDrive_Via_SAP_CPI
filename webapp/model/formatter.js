sap.ui.define([
	"sap/ui/core/format/DateFormat"
], function (DateFormat) {
	"use strict";

	let dateFormat;

	return {
		fileSize: function (bytes) {
			if (bytes === null || bytes === undefined || isNaN(bytes)) {
				return "—";
			}
			const units = ["o", "Ko", "Mo", "Go", "To"];
			let value = Number(bytes);
			let i = 0;
			while (value >= 1024 && i < units.length - 1) {
				value /= 1024;
				i++;
			}
			return (i === 0 ? value : value.toFixed(1)) + " " + units[i];
		},

		dateTime: function (iso) {
			if (!iso) {
				return "—";
			}
			const d = new Date(iso);
			if (isNaN(d.getTime())) {
				return "—";
			}
			if (!dateFormat) {
				dateFormat = DateFormat.getDateTimeInstance({ style: "medium" });
			}
			return dateFormat.format(d);
		}
	};
});