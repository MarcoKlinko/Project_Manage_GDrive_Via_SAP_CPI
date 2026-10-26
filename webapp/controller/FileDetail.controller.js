sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"../service/FileService",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast"
], function (BaseController, formatter, FileService, JSONModel, MessageBox, MessageToast) {
	"use strict";

	return BaseController.extend("com.duhamel.gdrivemanager.controller.FileDetail", {

		formatter: formatter,
		backRoute: "fileList",

		onInit: function () {
			this.setModel(new JSONModel({ busy: false, editing: false, newName: "", file: {} }), "detail");
			this.getRouter().getRoute("fileDetail").attachPatternMatched(this.onMatched, this);
		},

		onMatched: async function (event) {
			const fileId = decodeURIComponent(event.getParameter("arguments").fileId);
			const model = this.getModel("detail");
			model.setProperty("/busy", true);
			model.setProperty("/editing", false);
			try {
				const file = await FileService.getFile(fileId);
				if (!file) {
					MessageBox.error(this.getText("notFound"), { onClose: () => this.onNavBack() });
					return;
				}
				model.setProperty("/file", this.decorate(file));
			} catch (err) {
				this.showError("detailError", err);
			} finally {
				model.setProperty("/busy", false);
			}
		},

		onDownload: async function () {
			const file = this.getModel("detail").getProperty("/file");
			try {
				await FileService.download(file);
				MessageToast.show(this.getText("downloadOk", [file.name]));
			} catch (err) {
				this.showError("downloadError", err);
			}
		},

		onPreview: function () {
			this.openPreview(this.getModel("detail").getProperty("/file"));
		},

		onEdit: function () {
			const model = this.getModel("detail");
			model.setProperty("/newName", model.getProperty("/file/name"));
			model.setProperty("/editing", true);
		},

		onCancelEdit: function () {
			this.getModel("detail").setProperty("/editing", false);
		},

		onSave: async function () {
			const model = this.getModel("detail");
			const name = (model.getProperty("/newName") || "").trim();
			if (!name) {
				MessageToast.show(this.getText("nameRequired"));
				return;
			}
			model.setProperty("/busy", true);
			try {
				await FileService.update(model.getProperty("/file/fileId"), { name: name });
				model.setProperty("/file/name", name);
				model.setProperty("/file/modifiedTime", new Date().toISOString());
				model.setProperty("/editing", false);
				MessageToast.show(this.getText("updateOk"));
			} catch (err) {
				this.showError("updateError", err);
			} finally {
				model.setProperty("/busy", false);
			}
		},

		onDelete: function () {
			const file = this.getModel("detail").getProperty("/file");
			MessageBox.confirm(this.getText("deleteConfirm", [file.name]), {
				title: this.getText("deleteTitle"),
				actions: [MessageBox.Action.DELETE, MessageBox.Action.CANCEL],
				emphasizedAction: MessageBox.Action.DELETE,
				styleClass: "gdDeleteBox",
				onClose: async (action) => {
					if (action !== MessageBox.Action.DELETE) { return; }
					try {
						await FileService.remove(file.fileId);
						MessageToast.show(this.getText("deleteOk"));
						this.onNavBack();
					} catch (err) {
						this.showError("deleteError", err);
					}
				}
			});
		}
	});
});