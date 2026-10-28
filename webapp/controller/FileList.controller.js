sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"../service/FileService",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/core/Fragment",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/m/Dialog",
	"sap/m/Button",
	"sap/m/Input",
	"sap/m/Label"
], function (BaseController, formatter, FileService, JSONModel, Filter, FilterOperator, Fragment,
	MessageBox, MessageToast, Dialog, Button, Input, Label) {
	"use strict";

	return BaseController.extend("com.duhamel.gdrivemanager.controller.FileList", {

		formatter: formatter,

		onInit: function () {
			this.setModel(new JSONModel({
				busy: false, files: [], count: 0, type: "all",
				uploading: false, uploadFileName: "", uploadFileInfo: ""
			}), "list");
			this.getRouter().getRoute("fileList").attachPatternMatched(this.onRouteMatched, this);
		},

		/** Lit le filtre éventuel de l’URL : #/files?type=image */
		onRouteMatched: async function (event) {
			const query = event.getParameter("arguments")["?query"] || {};
			this.getModel("list").setProperty("/type", query.type || "all");
			this.byId("searchField").setValue("");
			this.byId("dateRange").setValue("");
			await this.loadFiles();
		},

		loadFiles: async function () {
			const model = this.getModel("list");
			model.setProperty("/busy", true);
			try {
				const files = (await FileService.getFiles()).map((f) => this.decorate(f));
				model.setProperty("/files", files);
				this.applyFilters();
			} catch (err) {
				this.showError("listError", err);
			} finally {
				model.setProperty("/busy", false);
			}
		},

		/* ------------------------------ Filtres ------------------------------ */

				/** Combine type, recherche texte et période de modification. */
		applyFilters: function () {
			const binding = this.byId("fileTable").getBinding("items");
			if (!binding) { return; }
			const type = this.getModel("list").getProperty("/type");
			const query = (this.byId("searchField").getValue() || "").trim();
			const range = this.byId("dateRange");
			const from = range.getDateValue();
			const to = range.getSecondDateValue();
			const filters = [];

			if (type === "documents") {
				// « Documents » = PDF OU Office OU Google Docs OU texte (opérateurs standard)
				filters.push(new Filter({
					filters: ["pdf", "office", "google", "text"].map(
						(key) => new Filter("category", FilterOperator.EQ, key)
					),
					and: false
				}));
			} else if (type && type !== "all") {
				filters.push(new Filter("category", FilterOperator.EQ, type));
			}

			if (query) {
				filters.push(new Filter({
					filters: [
						new Filter("name", FilterOperator.Contains, query),
						new Filter("typeText", FilterOperator.Contains, query),
						new Filter("mimeType", FilterOperator.Contains, query)
					],
					and: false
				}));
			}

			if (from && to) {
				const end = new Date(to);
				end.setHours(23, 59, 59, 999);
				filters.push(new Filter("modifiedTs", FilterOperator.BT, from.getTime(), end.getTime()));
			}

			binding.filter(filters.length ? new Filter({ filters: filters, and: true }) : []);
			this.getModel("list").setProperty("/count", binding.getLength());
		},

		onFilterChange: function () {
			this.applyFilters();
		},

		onResetFilters: function () {
			this.getModel("list").setProperty("/type", "all");
			this.byId("searchField").setValue("");
			this.byId("dateRange").setValue("");
			this.applyFilters();
		},

		onRefresh: function () {
			this.loadFiles();
		},

		/** Clic sur un fichier : aperçu (image, vidéo, PDF, document…). */
		onItemPress: function (event) {
			const file = event.getSource().getBindingContext("list").getObject();
			this.openPreview(file);
		},

		openDetail: function (file) {
			this.getRouter().navTo("fileDetail", { fileId: encodeURIComponent(file.fileId) });
		},

		/* ------------------------------ Actions ------------------------------ */

		/** Menu « … » d’une ligne. */
		onMenuAction: function (event) {
			const item = event.getParameter("item");
			const context = item.getBindingContext("list") ||
				event.getSource().getParent().getBindingContext("list");
			if (!context) { return; }
			const file = context.getObject();

			switch (item.data("action")) {
				case "detail": this.openDetail(file); break;
				case "rename": this.renameFile(file); break;
				case "download": this.downloadFile(file); break;
				case "delete": this.deleteFile(file); break;
			}
		},

		downloadFile: async function (file) {
			try {
				await FileService.download(file);
				MessageToast.show(this.getText("downloadOk", [file.name]));
			} catch (err) {
				this.showError("downloadError", err);
			}
		},

		renameFile: function (file) {
			const input = new Input({ value: file.name, width: "100%" });
			const dialog = new Dialog({
				title: this.getText("renameTitle"),
				content: [new Label({ text: this.getText("fileName"), labelFor: input }), input],
				beginButton: new Button({
					text: this.getText("save"),
					type: "Emphasized",
					press: async () => {
						const name = input.getValue().trim();
						if (!name) {
							input.setValueState("Error");
							return;
						}
						dialog.close();
						try {
							await FileService.update(file.fileId, { name: name });
							MessageToast.show(this.getText("updateOk"));
							this.loadFiles();
						} catch (err) {
							this.showError("updateError", err);
						}
					}
				}),
				endButton: new Button({ text: this.getText("cancel"), press: () => dialog.close() }),
				afterClose: () => dialog.destroy()
			});
			dialog.addStyleClass("sapUiContentPadding");
			dialog.open();
		},

		
		deleteFile: function (file) {
			MessageBox.confirm(
				this.getText("deleteConfirm", [file.name]),
				{
					title: this.getText("deleteTitle"),
					actions: [
						MessageBox.Action.DELETE,
						MessageBox.Action.CANCEL
					],
					emphasizedAction: MessageBox.Action.DELETE,
					styleClass: "gdDeleteBox",

					onClose: async (action) => {
						if (action !== MessageBox.Action.DELETE) {
							return;
						}

						try {
							await FileService.remove(file.fileId);

							MessageToast.show(this.getText("deleteOk"));

							this.loadFiles();
						} catch (err) {
							this.showError("deleteError", err);
						}
					}
				}
			);
		},


		/* ------------------------- Import (dialogue) -------------------------- */

		onUploadPress: async function () {
			if (!this._uploadDialog) {
				this._uploadDialog = await Fragment.load({
					id: this.getView().getId(),
					name: "com.duhamel.gdrivemanager.view.UploadDialog",
					controller: this
				});
				this.getView().addDependent(this._uploadDialog);
			}
			this._uploadFile = null;
			const model = this.getModel("list");
			model.setProperty("/uploadFileName", "");
			model.setProperty("/uploadFileInfo", "");
			model.setProperty("/uploading", false);
			this._uploadDialog.open();
		},

		/** Active le glisser-déposer sur la zone une fois le dialogue affiché. */
		onUploadAfterOpen: function () {
			const zone = this.byId("dropZone").getDomRef();
			if (!zone || zone._gdBound) { return; }
			zone.addEventListener("dragover", (e) => {
				e.preventDefault();
				zone.classList.add("gdDropActive");
			});
			zone.addEventListener("dragleave", () => zone.classList.remove("gdDropActive"));
			zone.addEventListener("drop", (e) => {
				e.preventDefault();
				zone.classList.remove("gdDropActive");
				const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
				if (file) { this.setUploadFile(file); }
			});
			zone._gdBound = true;
		},

		onBrowse: function () {
			const input = document.createElement("input");
			input.type = "file";
			input.addEventListener("change", () => {
				if (input.files && input.files[0]) {
					this.setUploadFile(input.files[0]);
				}
			});
			input.click();
		},

		setUploadFile: function (file) {
			this._uploadFile = file;
			const model = this.getModel("list");
			model.setProperty("/uploadFileName", file.name);
			model.setProperty("/uploadFileInfo",
				(file.type || "—") + " · " + formatter.fileSize(file.size));
		},

		onConfirmUpload: async function () {
			if (!this._uploadFile) { return; }
			const file = this._uploadFile;
			const model = this.getModel("list");
			model.setProperty("/uploading", true);
			try {
				await FileService.upload(file);
				this._uploadDialog.close();
				MessageToast.show(this.getText("uploadOk", [file.name]));
				await this.loadFiles();
			} catch (err) {
				this.showError("uploadError", err);
			} finally {
				model.setProperty("/uploading", false);
			}
		},

		onCancelUpload: function () {
			this._uploadDialog.close();
		}
	});
});