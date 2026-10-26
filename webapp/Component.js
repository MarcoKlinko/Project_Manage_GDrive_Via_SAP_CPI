sap.ui.define([
	"sap/ui/core/UIComponent",
	"sap/ui/core/Theming"
], function (UIComponent, Theming) {
	"use strict";

	return UIComponent.extend("com.duhamel.gdrivemanager.Component", {
		metadata: {
			manifest: "json",
			interfaces: ["sap.ui.core.IAsyncContentCreation"]
		},

		init: function () {
			UIComponent.prototype.init.apply(this, arguments);

			// Thème mémorisé (clair / sombre)
			try {
				const saved = window.localStorage.getItem("gd-theme");
				if (saved) {
					Theming.setTheme(saved);
				}
			} catch (e) {
				// stockage indisponible : on garde le thème par défaut
			}

			this.getRouter().initialize();
		}
	});
});