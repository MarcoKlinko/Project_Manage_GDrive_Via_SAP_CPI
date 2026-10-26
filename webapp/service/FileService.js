sap.ui.define([], function () {
	"use strict";

	const BASE = "/http/manage/file/gd/v2";

	/**
	 * Configuration centrale des appels SAP CPI.
	 * Tout ce qui dépend des iFlows se règle ici.
	 */
	const CONFIG = {
		// true tant que l’iFlow qui renvoie la liste JSON des fichiers n’existe pas.
		USE_MOCK_LIST: false,

		// Source de l’aperçu au clic sur un fichier :
		//  "drive" = intègre l’aperçu Google Drive (aucun iFlow nécessaire, compte Google connecté requis)
		//  "cpi"   = télécharge le fichier via l’iFlow /download (il doit renvoyer le fichier lui-même)
		PREVIEW_SOURCE: "drive",

		// Où l’iFlow lit "fileId" : "query" (?fileId=...) ou "header"
		FILE_ID_MODE: "query",

		METHODS: { upload: "POST", update: "POST", remove: "POST" },

		ENDPOINTS: {
			count: BASE + "/list",         // renvoie aujourd’hui le comptage (texte)
			files: BASE + "/files",        // à créer : JSON [{fileId, name, mimeType, size, modifiedTime}]
			download: BASE + "/download",
			upload: BASE + "/upload",
			update: BASE + "/update",
			remove: BASE + "/delete"
		}
	};

	const ICONS = {
		image: "sap-icon://picture",
		pdf: "sap-icon://pdf-attachment",
		folder: "sap-icon://folder-full",
		video: "sap-icon://attachment-video",
		google: "sap-icon://document-text",
		office: "sap-icon://excel-attachment",
		archive: "sap-icon://attachment-zip-file",
		shortcut: "sap-icon://chain-link",
		text: "sap-icon://attachment-text-file",
		other: "sap-icon://document"
	};

	/* ---------------------------- Utilitaires ---------------------------- */

	function delay(ms) {
		return new Promise(function (resolve) { setTimeout(resolve, ms); });
	}

	function labelToKey(label) {
		const l = String(label).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
		if (l.includes("image")) { return "image"; }
		if (l.includes("pdf")) { return "pdf"; }
		if (l.includes("dossier") || l.includes("folder")) { return "folder"; }
		if (l.includes("video")) { return "video"; }
		if (l.includes("google")) { return "google"; }
		if (l.includes("office")) { return "office"; }
		if (l.includes("archive")) { return "archive"; }
		if (l.includes("raccourci") || l.includes("shortcut")) { return "shortcut"; }
		if (l.includes("texte") || l.includes("text")) { return "text"; }
		return "other";
	}

	function mimeToKey(mime) {
		const m = String(mime || "").toLowerCase();
		if (m === "application/vnd.google-apps.folder") { return "folder"; }
		if (m === "application/vnd.google-apps.shortcut") { return "shortcut"; }
		if (m.startsWith("application/vnd.google-apps")) { return "google"; }
		if (m.startsWith("image/")) { return "image"; }
		if (m.startsWith("video/")) { return "video"; }
		if (m === "application/pdf") { return "pdf"; }
		if (m.includes("officedocument") || m.includes("msword") || m.includes("ms-excel") ||
			m.includes("ms-powerpoint") || m.includes("opendocument")) { return "office"; }
		if (m.includes("zip") || m.includes("tar") || m.includes("rar") || m.includes("7z")) { return "archive"; }
		if (m.startsWith("text/")) { return "text"; }
		return "other";
	}

	function normalizeFile(raw) {
		return {
			fileId: raw.fileId || raw.id,
			name: raw.name || "",
			mimeType: raw.mimeType || "",
			size: raw.size === undefined || raw.size === null || raw.size === "" ? null : Number(raw.size),
			createdTime: raw.createdTime || null,
			modifiedTime: raw.modifiedTime || null,
			category: mimeToKey(raw.mimeType)
		};
	}

	function buildStats(counts, total) {
		const sum = Object.keys(counts).reduce(function (acc, k) { return acc + counts[k]; }, 0);
		const grand = total || sum;
		const byType = Object.keys(counts).map(function (key) {
			return {
				key: key,
				count: counts[key],
				percent: grand ? (counts[key] * 100) / grand : 0
			};
		}).sort(function (a, b) { return b.count - a.count; });
		return { total: grand, byType: byType };
	}

	// Lit le texte renvoyé par l’iFlow de comptage : "- Image : 678" ... "Total : 922"
	function parseCount(text) {
		const counts = {};
		let total = 0;
		String(text).split(/\r?\n/).forEach(function (line) {
			const m = line.match(/^\s*-?\s*(.+?)\s*:\s*(\d+)\s*$/);
			if (!m) { return; }
			const n = parseInt(m[2], 10);
			if (m[1].trim().toLowerCase() === "total") {
				total = n;
			} else {
				const key = labelToKey(m[1]);
				counts[key] = (counts[key] || 0) + n;
			}
		});
		return buildStats(counts, total);
	}

	function statsFromFiles(files) {
		const counts = {};
		files.forEach(function (f) { counts[f.category] = (counts[f.category] || 0) + 1; });
		return buildStats(counts, files.length);
	}

	async function request(url, options) {
		const res = await fetch(url, options || {});
		if (!res.ok) {
			let body = "";
			try { body = (await res.text()).slice(0, 200); } catch (e) { /* ignore */ }
			const err = new Error("HTTP " + res.status + (body ? " – " + body : ""));
			err.status = res.status;
			throw err;
		}
		return res;
	}

	function withFileId(url, fileId, options) {
		const opts = Object.assign({}, options);
		let finalUrl = url;
		if (CONFIG.FILE_ID_MODE === "header") {
			opts.headers = Object.assign({}, opts.headers, { fileId: fileId });
		} else {
			finalUrl += (url.includes("?") ? "&" : "?") + "fileId=" + encodeURIComponent(fileId);
		}
		return { url: finalUrl, options: opts };
	}

	function saveBlob(blob, name) {
		const href = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = href;
		a.download = name || "fichier";
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		setTimeout(function () { URL.revokeObjectURL(href); }, 1000);
	}

	/* ------------------------ Données de démonstration ------------------------ */

	function mf(id, name, mime, size, modified) {
		return normalizeFile({
			fileId: id, name: name, mimeType: mime, size: size,
			createdTime: modified, modifiedTime: modified
		});
	}

	let mockFiles = [
		mf("m01", "SAP_TEST.jpg", "image/jpeg", 482113, "2026-10-19T09:12:00Z"),
		mf("m02", "Rapport_Q3_2026.pdf", "application/pdf", 1843200, "2026-10-17T14:30:00Z"),
		mf("m03", "Budget_2027.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 96340, "2026-10-15T08:05:00Z"),
		mf("m04", "Présentation_CPI.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", 5242880, "2026-10-14T16:45:00Z"),
		mf("m05", "Contrat_fournisseur.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 58211, "2026-10-12T11:20:00Z"),
		mf("m06", "Photos_voyage", "application/vnd.google-apps.folder", null, "2026-10-10T10:00:00Z"),
		mf("m07", "Archives_2025", "application/vnd.google-apps.folder", null, "2026-10-09T10:00:00Z"),
		mf("m08", "Démo_produit.mp4", "video/mp4", 73400320, "2026-10-08T13:15:00Z"),
		mf("m09", "Notes_réunion", "application/vnd.google-apps.document", null, "2026-10-07T09:40:00Z"),
		mf("m10", "Suivi_projet", "application/vnd.google-apps.spreadsheet", null, "2026-10-06T17:25:00Z"),
		mf("m11", "Logo_entreprise.png", "image/png", 128400, "2026-10-05T12:00:00Z"),
		mf("m12", "Facture_octobre.pdf", "application/pdf", 214500, "2026-10-04T08:50:00Z"),
		mf("m13", "backup_données.zip", "application/zip", 31457280, "2026-10-03T22:10:00Z"),
		mf("m14", "README.txt", "text/plain", 2048, "2026-10-02T07:30:00Z"),
		mf("m15", "Banner_site.webp", "image/webp", 90210, "2026-10-01T15:00:00Z"),
		mf("m16", "Schéma_architecture.pdf", "application/pdf", 640000, "2026-09-30T10:10:00Z"),
		mf("m17", "Formation_UI5.mp4", "video/mp4", 120586240, "2026-09-28T18:00:00Z"),
		mf("m18", "Inventaire.csv", "text/csv", 15360, "2026-09-27T09:00:00Z"),
		mf("m19", "Raccourci_dossier_RH", "application/vnd.google-apps.shortcut", null, "2026-09-25T09:00:00Z"),
		mf("m20", "Capture_écran.png", "image/png", 356000, "2026-09-24T11:11:00Z")
	];

	/* ------------------------------ API publique ------------------------------ */

	return {
		isMockList: function () { return CONFIG.USE_MOCK_LIST; },
		getIcon: function (key) { return ICONS[key] || ICONS.other; },
		mimeToKey: mimeToKey,
		parseCount: parseCount,

		/** Dashboard : total + répartition par type. */
		getStats: async function () {
			try {
				const res = await request(CONFIG.ENDPOINTS.count);
				const stats = parseCount(await res.text());
				if (!stats.total) {
					throw new Error("Réponse de comptage vide");
				}
				return stats;
			} catch (err) {
				if (CONFIG.USE_MOCK_LIST) {
					const fallback = statsFromFiles(mockFiles);
					fallback.fallback = err.message;
					return fallback;
				}
				throw err;
			}
		},

		/** Liste des fichiers. */
		getFiles: async function () {
			if (CONFIG.USE_MOCK_LIST) {
				await delay(250);
				return mockFiles.map(function (f) { return Object.assign({}, f); });
			}
			const res = await request(CONFIG.ENDPOINTS.files);
			const json = await res.json();
			const arr = Array.isArray(json) ? json : (json.files || []);
			return arr.map(normalizeFile);
		},

		/** Détail d’un fichier (depuis la liste). */
		getFile: async function (fileId) {
			const files = await this.getFiles();
			return files.find(function (f) { return f.fileId === fileId; }) || null;
		},

		/** Téléchargement : récupère le contenu et déclenche l’enregistrement. */
				/** Contenu du fichier via l’iFlow /download. */
		fetchBlob: async function (file) {
			if (CONFIG.USE_MOCK_LIST) {
				await delay(200);
				return new Blob(["Fichier de démonstration : " + file.name], { type: "text/plain" });
			}
			const r = withFileId(CONFIG.ENDPOINTS.download, file.fileId);
			const res = await request(r.url, r.options);
			return res.blob();
		},

		/** Téléchargement : récupère le contenu et déclenche l’enregistrement. */
		download: async function (file) {
			saveBlob(await this.fetchBlob(file), file.name);
		},

		getPreviewSource: function () { return CONFIG.PREVIEW_SOURCE; },

		/** Liens Google Drive : aperçu intégrable (embedUrl) et ouverture dans Drive (openUrl). */
		getLinks: function (file) {
			const id = encodeURIComponent(file.fileId);
			const mime = file.mimeType || "";
			const natives = {
				"application/vnd.google-apps.document": "https://docs.google.com/document/d/",
				"application/vnd.google-apps.spreadsheet": "https://docs.google.com/spreadsheets/d/",
				"application/vnd.google-apps.presentation": "https://docs.google.com/presentation/d/"
			};
			if (mime === "application/vnd.google-apps.folder") {
				return { embedUrl: null, openUrl: "https://drive.google.com/drive/folders/" + id };
			}
			if (natives[mime]) {
				return { embedUrl: natives[mime] + id + "/preview", openUrl: natives[mime] + id + "/edit" };
			}
			if (mime === "application/vnd.google-apps.shortcut") {
				return { embedUrl: null, openUrl: "https://drive.google.com/file/d/" + id + "/view" };
			}
			return {
				embedUrl: "https://drive.google.com/file/d/" + id + "/preview",
				openUrl: "https://drive.google.com/file/d/" + id + "/view"
			};
		},

		/** Modification (renommage). */
		update: async function (fileId, changes) {
			if (CONFIG.USE_MOCK_LIST) {
				await delay(250);
				const f = mockFiles.find(function (x) { return x.fileId === fileId; });
				if (f) {
					f.name = changes.name;
					f.modifiedTime = new Date().toISOString();
				}
				return f ? Object.assign({}, f) : null;
			}
			const r = withFileId(CONFIG.ENDPOINTS.update, fileId, {
				method: CONFIG.METHODS.update,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(changes)
			});
			await request(r.url, r.options);
			return null;
		},

		/** Suppression. */
		remove: async function (fileId) {
			if (CONFIG.USE_MOCK_LIST) {
				await delay(250);
				mockFiles = mockFiles.filter(function (x) { return x.fileId !== fileId; });
				return;
			}
			const r = withFileId(CONFIG.ENDPOINTS.remove, fileId, { method: CONFIG.METHODS.remove });
			await request(r.url, r.options);
		},

		/** Upload (multipart/form-data, champ "file"). */
		upload: async function (file) {
			if (CONFIG.USE_MOCK_LIST) {
				await delay(400);
				mockFiles.unshift(normalizeFile({
					fileId: "m" + Date.now(), name: file.name, mimeType: file.type,
					size: file.size, createdTime: new Date().toISOString(), modifiedTime: new Date().toISOString()
				}));
				return;
			}
			const form = new FormData();
			form.append("file", file, file.name);
			await request(CONFIG.ENDPOINTS.upload, { method: CONFIG.METHODS.upload, body: form });
		}
	};
});