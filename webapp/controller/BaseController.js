sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/core/UIComponent",
	"sap/ui/core/Theming",
	"sap/ui/core/HTML",
	"sap/m/MessageBox",
	"sap/m/Dialog",
	"sap/m/Button",
	"../service/FileService"
], function (Controller, UIComponent, Theming, HTML, MessageBox, Dialog, Button, FileService) {
	"use strict";

	function escapeHtml(text) {
		return String(text).replace(/[&<>"']/g, function (c) {
			return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
		});
	}

	return Controller.extend("com.duhamel.gdrivemanager.controller.BaseController", {

		backRoute: "dashboard",

		getRouter: function () {
			return UIComponent.getRouterFor(this);
		},

		getModel: function (name) {
			return this.getView().getModel(name);
		},

		setModel: function (model, name) {
			this.getView().setModel(model, name);
			return this;
		},

		getText: function (key, args) {
			return this.getOwnerComponent().getModel("i18n").getResourceBundle().getText(key, args);
		},

		showError: function (key, error) {
			MessageBox.error(this.getText(key, [error && error.message ? error.message : String(error)]));
		},

		/** Ajoute le libellé et l’icône du type à un fichier. */
		decorate: function (file) {
			return Object.assign({}, file, {
				modifiedTs: file.modifiedTime ? new Date(file.modifiedTime).getTime() : 0,
				typeText: this.getText("type." + file.category),
				typeIcon: FileService.getIcon(file.category)
			});
		},

		onNavBack: function () {
			this.getRouter().navTo(this.backRoute, {}, true);
		},

		onToggleTheme: function () {
			const isDark = /dark/i.test(Theming.getTheme());
			const next = isDark ? "sap_horizon" : "sap_horizon_dark";
			Theming.setTheme(next);
			try {
				window.localStorage.setItem("gd-theme", next);
			} catch (e) {
				// stockage indisponible
			}
		},

		/* --------------------------- Aperçu d’un fichier --------------------------- */

		/** Ouvre l’aperçu : image affichée, vidéo lue, PDF et documents ouverts dans une fenêtre. */
		openPreview: async function (file) {
			const links = FileService.getLinks(file);
			const viaCpi = FileService.getPreviewSource() === "cpi" &&
				["image", "video", "pdf", "text"].includes(file.category);
			let objectUrl = null;
			let closed = false;

			const html = new HTML({ content: "<div class='gdPreviewBox'></div>" });
			const render = (inner) => html.setContent("<div class='gdPreviewBox'>" + inner + "</div>");

			const dialog = new Dialog({
				title: file.name,
				contentWidth: "70rem",
				draggable: true,
				resizable: true,
				stretchOnPhone: true,
				content: [html],
				buttons: [
					new Button({
						text: this.getText("viewDetails"),
						icon: "sap-icon://detail-view",
						press: () => {
							dialog.close();
							this.getRouter().navTo("fileDetail", { fileId: encodeURIComponent(file.fileId) });
						}
					}),
					new Button({
						text: this.getText("openInDrive"),
						icon: "sap-icon://inspect",
						press: () => window.open(links.openUrl, "_blank", "noopener")
					}),
					new Button({
						text: this.getText("download"),
						icon: "sap-icon://download",
						press: () => FileService.download(file).catch((err) => this.showError("downloadError", err))
					}),
					new Button({ text: this.getText("close"), type: "Emphasized", press: () => dialog.close() })
				],
				afterClose: () => {
					closed = true;
					if (objectUrl) { URL.revokeObjectURL(objectUrl); }
					dialog.destroy();
				}
			});
			dialog.addStyleClass("gdPreviewDialog");
			dialog.open();

			try {
				if (viaCpi) {
					dialog.setBusy(true);
					const raw = await FileService.fetchBlob(file);
					if (closed) { return; }
					const blob = new Blob([raw], { type: file.mimeType || raw.type });

					if (file.category === "text") {
						render("<pre class='gdPreviewText'>" + escapeHtml(await blob.text()) + "</pre>");
					} else {
						objectUrl = URL.createObjectURL(blob);
						if (file.category === "image") {
							render("<img class='gdPreviewImg' src='" + objectUrl + "'>");
						} else if (file.category === "video") {
							render("<video class='gdPreviewMedia' src='" + objectUrl + "' controls autoplay></video>");
						} else {
							render("<iframe class='gdPreviewFrame' src='" + objectUrl + "'></iframe>");
						}
					}
				} else if (links.embedUrl) {
					render("<iframe class='gdPreviewFrame' src='" + links.embedUrl +
						"' allow='autoplay; fullscreen' allowfullscreen></iframe>");
				} else {
					render("<div class='gdPreviewMsg'>" + escapeHtml(this.getText("previewNone")) + "</div>");
				}
			} catch (err) {
				render("<div class='gdPreviewMsg'>" +
					escapeHtml(this.getText("previewError", [err.message])) + "</div>");
			} finally {
				if (!closed) { dialog.setBusy(false); }
			}
		}
	});
});