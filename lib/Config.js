'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// A Config object provides information about how a specific app is
// configured.
// mount is the URL for the root of the API; includes http, domain, etc.

var Config = exports.Config = function Config(applicationId, mount) {
  _classCallCheck(this, Config);

  var cache = require('./cache');
  var DatabaseAdapter = require('./DatabaseAdapter');

  var cacheInfo = cache.apps[applicationId];
  this.valid = !!cacheInfo;
  if (!this.valid) {
    return;
  }

  this.applicationId = applicationId;
  this.collectionPrefix = cacheInfo.collectionPrefix || '';
  this.masterKey = cacheInfo.masterKey;
  this.clientKey = cacheInfo.clientKey;
  this.javascriptKey = cacheInfo.javascriptKey;
  this.dotNetKey = cacheInfo.dotNetKey;
  this.restAPIKey = cacheInfo.restAPIKey;
  this.fileKey = cacheInfo.fileKey;
  this.facebookAppIds = cacheInfo.facebookAppIds;
  this.enableAnonymousUsers = cacheInfo.enableAnonymousUsers;

  this.database = DatabaseAdapter.getDatabaseConnection(applicationId);
  this.filesController = cacheInfo.filesController;
  this.pushController = cacheInfo.pushController;
  this.loggerController = cacheInfo.loggerController;
  this.oauth = cacheInfo.oauth;

  this.mount = mount;
};

;

exports.default = Config;

module.exports = Config;