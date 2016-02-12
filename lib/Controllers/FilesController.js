'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FilesController = undefined;

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); // FilesController.js

var _express = require('express');

var _express2 = _interopRequireDefault(_express);

var _mime = require('mime');

var _mime2 = _interopRequireDefault(_mime);

var _node = require('parse/node');

var _bodyParser = require('body-parser');

var _bodyParser2 = _interopRequireDefault(_bodyParser);

var _hat = require('hat');

var _hat2 = _interopRequireDefault(_hat);

var _middlewares = require('../middlewares');

var Middlewares = _interopRequireWildcard(_middlewares);

var _Config = require('../Config');

var _Config2 = _interopRequireDefault(_Config);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var rack = _hat2.default.rack();

var FilesController = exports.FilesController = function () {
  function FilesController(filesAdapter) {
    _classCallCheck(this, FilesController);

    this._filesAdapter = filesAdapter;
  }

  _createClass(FilesController, [{
    key: 'getHandler',
    value: function getHandler() {
      var _this = this;

      return function (req, res) {
        var config = new _Config2.default(req.params.appId);
        var filename = req.params.filename;
        _this._filesAdapter.getFileData(config, filename).then(function (data) {
          res.status(200);
          var contentType = _mime2.default.lookup(filename);
          res.set('Content-type', contentType);
          res.end(data);
        }).catch(function (error) {
          res.status(404);
          res.set('Content-type', 'text/plain');
          res.end('File not found.');
        });
      };
    }
  }, {
    key: 'createHandler',
    value: function createHandler() {
      var _this2 = this;

      return function (req, res, next) {
        if (!req.body || !req.body.length) {
          next(new _node.Parse.Error(_node.Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
          return;
        }

        if (req.params.filename.length > 128) {
          next(new _node.Parse.Error(_node.Parse.Error.INVALID_FILE_NAME, 'Filename too long.'));
          return;
        }

        if (!req.params.filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
          next(new _node.Parse.Error(_node.Parse.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.'));
          return;
        }

        // If a content-type is included, we'll add an extension so we can
        // return the same content-type.
        var extension = '';
        var hasExtension = req.params.filename.indexOf('.') > 0;
        var contentType = req.get('Content-type');
        if (!hasExtension && contentType && _mime2.default.extension(contentType)) {
          extension = '.' + _mime2.default.extension(contentType);
        }

        var filename = rack() + '_' + req.params.filename + extension;
        _this2._filesAdapter.createFile(req.config, filename, req.body).then(function () {
          res.status(201);
          var location = _this2._filesAdapter.getFileLocation(req.config, filename);
          res.set('Location', location);
          res.json({ url: location, name: filename });
        }).catch(function (error) {
          next(new _node.Parse.Error(_node.Parse.Error.FILE_SAVE_ERROR, 'Could not store file.'));
        });
      };
    }
  }, {
    key: 'deleteHandler',
    value: function deleteHandler() {
      var _this3 = this;

      return function (req, res, next) {
        _this3._filesAdapter.deleteFile(req.config, req.params.filename).then(function () {
          res.status(200);
          // TODO: return useful JSON here?
          res.end();
        }).catch(function (error) {
          next(new _node.Parse.Error(_node.Parse.Error.FILE_DELETE_ERROR, 'Could not delete file.'));
        });
      };
    }

    /**
     * Find file references in REST-format object and adds the url key
     * with the current mount point and app id.
     * Object may be a single object or list of REST-format objects.
     */

  }, {
    key: 'expandFilesInObject',
    value: function expandFilesInObject(config, object) {
      var _this4 = this;

      if (object instanceof Array) {
        object.map(function (obj) {
          return _this4.expandFilesInObject(config, obj);
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
  }, {
    key: 'getExpressRouter',
    value: function getExpressRouter() {
      var router = _express2.default.Router();
      router.get('/files/:appId/:filename', this.getHandler());

      router.post('/files', function (req, res, next) {
        next(new _node.Parse.Error(_node.Parse.Error.INVALID_FILE_NAME, 'Filename not provided.'));
      });

      router.post('/files/:filename', Middlewares.allowCrossDomain, _bodyParser2.default.raw({ type: '*/*', limit: '20mb' }), Middlewares.handleParseHeaders, this.createHandler());

      router.delete('/files/:filename', Middlewares.allowCrossDomain, Middlewares.handleParseHeaders, Middlewares.enforceMasterKeyAccess, this.deleteHandler());

      return router;
    }
  }]);

  return FilesController;
}();

exports.default = FilesController;