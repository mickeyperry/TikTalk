/*
 * Minimal CSInterface shim for CEP panels.
 * Wraps the host-injected window.__adobe_cep__ object. Provides only the
 * pieces this panel uses: evalScript, getSystemPath, getExtensionID.
 * (Adobe's full CSInterface.js can be dropped in to replace this if needed.)
 */
var SystemPath = {
    EXTENSION: "extension",
    USER_DATA: "userData",
    COMMON_FILES: "commonFiles",
    MY_DOCUMENTS: "myDocuments",
    HOST_APPLICATION: "hostApplication"
};

function CSInterface() {}

CSInterface.prototype.evalScript = function (script, callback) {
    if (callback === null || callback === undefined) {
        callback = function () {};
    }
    window.__adobe_cep__.evalScript(script, callback);
};

CSInterface.prototype.getSystemPath = function (pathType) {
    var path = decodeURI(window.__adobe_cep__.getSystemPath(pathType));
    // Strip the file:// prefix CEP adds on some platforms.
    var prefix = "file:///";
    if (path.indexOf(prefix) === 0) {
        path = path.slice(prefix.length);
    } else if (path.indexOf("file://") === 0) {
        path = path.slice("file://".length);
    }
    return path;
};

CSInterface.prototype.getExtensionID = function () {
    return window.__adobe_cep__.getExtensionId();
};

CSInterface.prototype.getOSInformation = function () {
    return (typeof navigator !== "undefined" && navigator.platform) || "";
};
