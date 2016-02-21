'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesController = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // FilesController.js


var _node = require('parse/node');

var _cryptoUtils = require('../cryptoUtils');

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var FilesController = exports.FilesController = function () {
  function FilesController(filesAdapter) {
    _classCallCheck(this, FilesController);

    this._filesAdapter = filesAdapter;
  }

  _createClass(FilesController, [{
    key: 'getFileData',
    value: function getFileData(config, filename) {
      return this._filesAdapter.getFileData(config, filename);
    }
  }, {
    key: 'createFile',
    value: function createFile(config, filename, data) {
      filename = (0, _cryptoUtils.randomHexString)(32) + '_' + filename;
      var location = this._filesAdapter.getFileLocation(config, filename);
      return this._filesAdapter.createFile(config, filename, data).then(function () {
        return Promise.resolve({
          url: location,
          name: filename
        });
      });
    }
  }, {
    key: 'deleteFile',
    value: function deleteFile(config, filename) {
      return this._filesAdapter.deleteFile(config, filename);
    }

    /**
     * Find file references in REST-format object and adds the url key
     * with the current mount point and app id.
     * Object may be a single object or list of REST-format objects.
     */

  }, {
    key: 'expandFilesInObject',
    value: function expandFilesInObject(config, object) {
      var _this = this;

      if (object instanceof Array) {
        object.map(function (obj) {
          return _this.expandFilesInObject(config, obj);
        });
        return;
      }
      if ((typeof object === 'undefined' ? 'undefined' : _typeof(object)) !== 'object') {
        return;
      }
      for (var key in object) {
        var fileObject = object[key];
        if (fileObject && fileObject['__type'] === 'File') {
          if (fileObject['url']) {
            continue;
          }
          var filename = fileObject['name'];
          if (filename.indexOf('tfss-') === 0) {
            fileObject['url'] = 'http://files.parsetfss.com/' + config.fileKey + '/' + encodeURIComponent(filename);
          } else {
            fileObject['url'] = this._filesAdapter.getFileLocation(config, filename);
          }
        }
      }
    }
  }]);

  return FilesController;
}();

exports.default = FilesController;