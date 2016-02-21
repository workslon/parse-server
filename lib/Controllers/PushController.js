'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushController = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _node = require('parse/node');

var _PromiseRouter = require('../PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _rest = require('../rest');

var _rest2 = _interopRequireDefault(_rest);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var PushController = exports.PushController = function () {
  function PushController(pushAdapter) {
    _classCallCheck(this, PushController);

    this._pushAdapter = pushAdapter;
  }

  _createClass(PushController, [{
    key: 'sendPush',
    value: function sendPush() {
      var body = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
      var where = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];
      var config = arguments[2];
      var auth = arguments[3];

      var pushAdapter = this._pushAdapter;
      if (!pushAdapter) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Push adapter is not available');
      }
      PushController.validateMasterKey(auth);

      PushController.validatePushType(where, pushAdapter.getValidPushTypes());
      // Replace the expiration_time with a valid Unix epoch milliseconds time
      body['expiration_time'] = PushController.getExpirationTime(body);
      // TODO: If the req can pass the checking, we return immediately instead of waiting
      // pushes to be sent. We probably change this behaviour in the future.
      _rest2.default.find(config, auth, '_Installation', where).then(function (response) {
        return pushAdapter.send(body, response.results);
      });
    }
  }], [{
    key: 'validatePushType',


    /**
     * Check whether the deviceType parameter in qury condition is valid or not.
     * @param {Object} where A query condition
     * @param {Array} validPushTypes An array of valid push types(string)
     */
    value: function validatePushType() {
      var where = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];
      var validPushTypes = arguments.length <= 1 || arguments[1] === undefined ? [] : arguments[1];

      var deviceTypeField = where.deviceType || {};
      var deviceTypes = [];
      if (typeof deviceTypeField === 'string') {
        deviceTypes.push(deviceTypeField);
      } else if (typeof deviceTypeField['$in'] === 'array') {
        deviceTypes.concat(deviceTypeField['$in']);
      }
      for (var i = 0; i < deviceTypes.length; i++) {
        var deviceType = deviceTypes[i];
        if (validPushTypes.indexOf(deviceType) < 0) {
          throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, deviceType + ' is not supported push type.');
        }
      }
    }
  }, {
    key: 'validateMasterKey',


    /**
     * Check whether the api call has master key or not.
     * @param {Object} request A request object
     */
    value: function validateMasterKey() {
      var auth = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      if (!auth.isMaster) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, 'Master key is invalid, you should only use master key to send push');
      }
    }
  }, {
    key: 'getExpirationTime',

    /**
     * Get expiration time from the request body.
     * @param {Object} request A request object
     * @returns {Number|undefined} The expiration time if it exists in the request
     */
    value: function getExpirationTime() {
      var body = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

      var hasExpirationTime = !!body['expiration_time'];
      if (!hasExpirationTime) {
        return;
      }
      var expirationTimeParam = body['expiration_time'];
      var expirationTime;
      if (typeof expirationTimeParam === 'number') {
        expirationTime = new Date(expirationTimeParam * 1000);
      } else if (typeof expirationTimeParam === 'string') {
        expirationTime = new Date(expirationTimeParam);
      } else {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, body['expiration_time'] + ' is not valid time.');
      }
      // Check expirationTime is valid or not, if it is not valid, expirationTime is NaN
      if (!isFinite(expirationTime)) {
        throw new _node.Parse.Error(_node.Parse.Error.PUSH_MISCONFIGURED, body['expiration_time'] + ' is not valid time.');
      }
      return expirationTime.valueOf();
    }
  }]);

  return PushController;
}();

;

exports.default = PushController;