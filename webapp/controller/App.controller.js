sap.ui.define([
	"./BaseController",
	"sap/ui/Device"
], function (BaseController, Device) {
	"use strict";

	return BaseController.extend("com.duhamel.gdrivemanager.controller.App", {
		onInit: function () {
			this.getView().addStyleClass(Device.support.touch ? "sapUiSizeCozy" : "sapUiSizeCompact");
		}
	});
});