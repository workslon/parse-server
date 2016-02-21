'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.LoggerController = exports.LogOrder = exports.LogLevel = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Promise = _node.Parse.Promise;
var MILLISECONDS_IN_A_DAY = 24 * 60 * 60 * 1000;

var LogLevel = exports.LogLevel = {
  INFO: 'info',
  ERROR: 'error'
};

var LogOrder = exports.LogOrder = {
  DESCENDING: 'desc',
  ASCENDING: 'asc'
};

var LoggerController = exports.LoggerController = function () {
  function LoggerController(loggerAdapter, loggerOptions) {
    _classCallCheck(this, LoggerController);

    this._loggerAdapter = loggerAdapter;
  }

  // check that date input is valid


  _createClass(LoggerController, [{
    key: 'getLogs',


    // Returns a promise for a {response} object.
    // query params:
    // level (optional) Level of logging you want to query for (info || error)
    // from (optional) Start time for the search. Defaults to 1 week ago.
    // until (optional) End time for the search. Defaults to current time.
    // order (optional) Direction of results returned, either “asc” or “desc”. Defaults to “desc”.
    // size (optional) Number of rows returned by search. Defaults to 10
    value: function getLogs() {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      if (!this._loggerAdapter) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Logger adapter is not availabe');
      }

      var promise = new _node.Parse.Promise();

      options = LoggerController.parseOptions(options);

      this._loggerAdapter.query(options, function (result) {
        promise.resolve(result);
      });
      return promise;
    }
  }], [{
    key: 'validDateTime',
    value: function validDateTime(date) {
      if (!date) {
        return null;
      }
      date = new Date(date);

      if (!isNaN(date.getTime())) {
        return date;
      }

      return null;
    }
  }, {
    key: 'parseOptions',
    value: function parseOptions() {
      var options = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var from = LoggerController.validDateTime(options.from) || new Date(Date.now() - 7 * MILLISECONDS_IN_A_DAY);
      var until = LoggerController.validDateTime(options.until) || new Date();
      var size = Number(options.size) || 10;
      var order = options.order || LogOrder.DESCENDING;
      var level = options.level || LogLevel.INFO;

      return {
        from: from,
        until: until,
        size: size,
        order: order,
        level: level
      };
    }
  }]);

  return LoggerController;
}();

exports.default = LoggerController;