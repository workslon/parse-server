"use strict";
// ParsePushAdapter is the default implementation of
// PushAdapter, it uses GCM for android push and APNS
// for ios push.

var Parse = require('parse/node').Parse;
var GCM = require('../../GCM');
var APNS = require('../../APNS');

function ParsePushAdapter(pushConfig) {
  this.validPushTypes = ['ios', 'android'];
  this.senderMap = {};

  pushConfig = pushConfig || {};
  var pushTypes = Object.keys(pushConfig);
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    for (var _iterator = pushTypes[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      var pushType = _step.value;

      if (this.validPushTypes.indexOf(pushType) < 0) {
        throw new Parse.Error(Parse.Error.PUSH_MISCONFIGURED, 'Push to ' + pushTypes + ' is not supported');
      }
      switch (pushType) {
        case 'ios':
          this.senderMap[pushType] = new APNS(pushConfig[pushType]);
          break;
        case 'android':
          this.senderMap[pushType] = new GCM(pushConfig[pushType]);
          break;
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

/**
 * Get an array of valid push types.
 * @returns {Array} An array of valid push types
 */
ParsePushAdapter.prototype.getValidPushTypes = function () {
  return this.validPushTypes;
};

ParsePushAdapter.prototype.send = function (data, installations) {
  var deviceMap = classifyInstallation(installations, this.validPushTypes);
  var sendPromises = [];
  for (var pushType in deviceMap) {
    var sender = this.senderMap[pushType];
    if (!sender) {
      console.log('Can not find sender for push type %s, %j', pushType, data);
      continue;
    }
    var devices = deviceMap[pushType];
    sendPromises.push(sender.send(data, devices));
  }
  return Parse.Promise.when(sendPromises);
};

/**g
 * Classify the device token of installations based on its device type.
 * @param {Object} installations An array of installations
 * @param {Array} validPushTypes An array of valid push types(string)
 * @returns {Object} A map whose key is device type and value is an array of device
 */
function classifyInstallation(installations, validPushTypes) {
  // Init deviceTokenMap, create a empty array for each valid pushType
  var deviceMap = {};
  var _iteratorNormalCompletion2 = true;
  var _didIteratorError2 = false;
  var _iteratorError2 = undefined;

  try {
    for (var _iterator2 = validPushTypes[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
      var validPushType = _step2.value;

      deviceMap[validPushType] = [];
    }
  } catch (err) {
    _didIteratorError2 = true;
    _iteratorError2 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion2 && _iterator2.return) {
        _iterator2.return();
      }
    } finally {
      if (_didIteratorError2) {
        throw _iteratorError2;
      }
    }
  }

  var _iteratorNormalCompletion3 = true;
  var _didIteratorError3 = false;
  var _iteratorError3 = undefined;

  try {
    for (var _iterator3 = installations[Symbol.iterator](), _step3; !(_iteratorNormalCompletion3 = (_step3 = _iterator3.next()).done); _iteratorNormalCompletion3 = true) {
      var installation = _step3.value;

      // No deviceToken, ignore
      if (!installation.deviceToken) {
        continue;
      }
      var pushType = installation.deviceType;
      if (deviceMap[pushType]) {
        deviceMap[pushType].push({
          deviceToken: installation.deviceToken,
          appIdentifier: installation.appIdentifier
        });
      } else {
        console.log('Unknown push type from installation %j', installation);
      }
    }
  } catch (err) {
    _didIteratorError3 = true;
    _iteratorError3 = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion3 && _iterator3.return) {
        _iterator3.return();
      }
    } finally {
      if (_didIteratorError3) {
        throw _iteratorError3;
      }
    }
  }

  return deviceMap;
}

if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  ParsePushAdapter.classifyInstallation = classifyInstallation;
}
module.exports = ParsePushAdapter;