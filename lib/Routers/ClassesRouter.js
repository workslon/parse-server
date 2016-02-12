'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ClassesRouter = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var ClassesRouter = exports.ClassesRouter = function () {
  function ClassesRouter() {
    _classCallCheck(this, ClassesRouter);
  }

  _createClass(ClassesRouter, [{
    key: 'handleFind',

    // Returns a promise that resolves to a {response} object.
    value: function handleFind(req) {
      var body = Object.assign(req.body, req.query);
      var options = {};
      if (body.skip) {
        options.skip = Number(body.skip);
      }
      if (body.limit) {
        options.limit = Number(body.limit);
      }
      if (body.order) {
        options.order = String(body.order);
      }
      if (body.count) {
        options.count = true;
      }
      if (typeof body.keys == 'string') {
        options.keys = body.keys;
      }
      if (body.include) {
        options.include = String(body.include);
      }
      if (body.redirectClassNameForKey) {
        options.redirectClassNameForKey = String(body.redirectClassNameForKey);
      }
      if (typeof body.where === 'string') {
        body.where = JSON.parse(body.where);
      }
      return _rest2.default.find(req.config, req.auth, req.params.className, body.where, options).then(function (response) {
        if (response && response.results) {
          var _iteratorNormalCompletion = true;
          var _didIteratorError = false;
          var _iteratorError = undefined;

          try {
            for (var _iterator = response.results[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
              var result = _step.value;

              if (result.sessionToken) {
                result.sessionToken = req.info.sessionToken || result.sessionToken;
              }
            }
          } catch (err) {
            _didIteratorError = true;
            _iteratorError = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion && _iterator.return) {
                _iterator.return();
              }
            } finally {
              if (_didIteratorError) {
                throw _iteratorError;
              }
            }
          }
        }
        return { response: response };
      });
    }

    // Returns a promise for a {response} object.

  }, {
    key: 'handleGet',
    value: function handleGet(req) {
      return _rest2.default.find(req.config, req.auth, req.params.className, { objectId: req.params.objectId }).then(function (response) {
        if (!response.results || response.results.length == 0) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
        }
        return { response: response.results[0] };
      });
    }
  }, {
    key: 'handleCreate',
    value: function handleCreate(req) {
      return _rest2.default.create(req.config, req.auth, req.params.className, req.body);
    }
  }, {
    key: 'handleUpdate',
    value: function handleUpdate(req) {
      return _rest2.default.update(req.config, req.auth, req.params.className, req.params.objectId, req.body).then(function (response) {
        return { response: response };
      });
    }
  }, {
    key: 'handleDelete',
    value: function handleDelete(req) {
      return _rest2.default.del(req.config, req.auth, req.params.className, req.params.objectId).then(function () {
        return { response: {} };
      });
    }
  }, {
    key: 'getExpressRouter',
    value: function getExpressRouter() {
      var _this = this;

      var router = new _PromiseRouter2.default();
      router.route('GET', '/classes/:className', function (req) {
        return _this.handleFind(req);
      });
      router.route('GET', '/classes/:className/:objectId', function (req) {
        return _this.handleGet(req);
      });
      router.route('POST', '/classes/:className', function (req) {
        return _this.handleCreate(req);
      });
      router.route('PUT', '/classes/:className/:objectId', function (req) {
        return _this.handleUpdate(req);
      });
      router.route('DELETE', '/classes/:className/:objectId', function (req) {
        return _this.handleDelete(req);
      });
      return router;
    }
  }]);

  return ClassesRouter;
}();

exports.default = ClassesRouter;