sap.ui.define([
	"./BaseController",
	"../model/formatter",
	"sap/ui/model/json/JSONModel",
	"sap/ui/core/format/NumberFormat",
	"../service/FileService"
], function (BaseController, formatter, JSONModel, NumberFormat, FileService) {
	"use strict";

	return BaseController.extend("com.duhamel.gdrivemanager.controller.Dashboard", {

		formatter: formatter,

		onInit: function () {
			this.setModel(new JSONModel({
				busy: false, total: 0, documents: 0, images: 0,
				videos: 0, folders: 0, byType: [], recent: [], warning: ""
			}), "stats");

			this.byId("donutChart").setVizProperties({
				title: { visible: false },
				legend: { visible: true },
				plotArea: { dataLabel: { visible: true } }
			});

			this.getRouter().getRoute("dashboard").attachPatternMatched(this.loadStats, this);
		},

		loadStats: async function () {
			const model = this.getModel("stats");
			model.setProperty("/busy", true);
			model.setProperty("/warning", "");
			try {
				const stats = await FileService.getStats();
				const pct = NumberFormat.getFloatInstance({ maxFractionDigits: 1 });
				const counts = {};
				stats.byType.forEach((t) => { counts[t.key] = t.count; });
				const n = (key) => counts[key] || 0;

				model.setData({
					busy: true,
					total: stats.total,
					documents: n("pdf") + n("office") + n("google") + n("text"),
					images: n("image"),
					videos: n("video"),
					folders: n("folder"),
					byType: stats.byType.map((t) => ({
						key: t.key,
						label: this.getText("type." + t.key),
						icon: FileService.getIcon(t.key),
						count: t.count,
						percent: t.percent,
						display: t.count + " (" + pct.format(t.percent) + " %)"
					})),
					recent: [],
					warning: stats.fallback ? this.getText("statsFallback", [stats.fallback]) : ""
				});
			} catch (err) {
				this.showError("statsError", err);
			} finally {
				model.setProperty("/busy", false);
			}
			this.loadRecent();
		},

		/** Carte « derniers fichiers » : silencieuse si la liste n’est pas disponible. */
		loadRecent: async function () {
			try {
				const files = await FileService.getFiles();
				const recent = files
					.filter((f) => f.category !== "folder" && f.modifiedTime)
					.sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime))
					.slice(0, 5)
					.map((f) => this.decorate(f));
				this.getModel("stats").setProperty("/recent", recent);
			} catch (err) {
				this.getModel("stats").setProperty("/recent", []);
			}
		},

		onRefresh: function () {
			this.loadStats();
		},

		onGoToFiles: function () {
			this.getRouter().navTo("fileList");
		},

		/** Tuile ou ligne de répartition : ouvre la liste filtrée sur le type (CustomData "type"). */
		onTypePress: function (event) {
			this.goToType(event.getSource().data("type"));
		},

		/** Clic sur une part du graphique en anneau. */
		onChartSelect: function (event) {
			const data = event.getParameter("data");
			if (!data || !data.length) { return; }
			const label = data[0].data[this.getText("chartType")];
			const entry = this.getModel("stats").getProperty("/byType").find((t) => t.label === label);
			if (entry) {
				this.goToType(entry.key);
			}
		},

		onRecentPress: function (event) {
			const file = event.getSource().getBindingContext("stats").getObject();
			this.openPreview(file);
		},

		goToType: function (type) {
			if (!type || type === "all") {
				this.getRouter().navTo("fileList");
			} else {
				this.getRouter().navTo("fileList", { "?query": { type: type } });
			}
		}
	});
});