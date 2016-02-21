'use strict';

// A RestWrite encapsulates everything we need to run an operation
// that writes to the database.
// This could be either a "create" or an "update".

var deepcopy = require('deepcopy');

var Auth = require('./Auth');
var cache = require('./cache');
var Config = require('./Config');
var cryptoUtils = require('./cryptoUtils');
var passwordCrypto = require('./password');
var oauth = require("./oauth");
var Parse = require('parse/node');
var triggers = require('./triggers');

// query and data are both provided in REST API format. So data
// types are encoded by plain old objects.
// If query is null, this is a "create" and the data in data should be
// created.
// Otherwise this is an "update" - the object matching the query
// should get updated with data.
// RestWrite will handle objectId, createdAt, and updatedAt for
// everything. It also knows to use triggers and special modifications
// for the _User class.
function RestWrite(config, auth, className, query, data, originalData) {
  this.config = config;
  this.auth = auth;
  this.className = className;
  this.storage = {};
  this.runOptions = {};

  if (!query && data.objectId) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'objectId ' + 'is an invalid field name.');
  }

  // When the operation is complete, this.response may have several
  // fields.
  // response: the actual data to be returned
  // status: the http status code. if not present, treated like a 200
  // location: the location header. if not present, no location header
  this.response = null;

  // Processing this operation may mutate our data, so we operate on a
  // copy
  this.query = deepcopy(query);
  this.data = deepcopy(data);
  // We never change originalData, so we do not need a deep copy
  this.originalData = originalData;

  // The timestamp we'll use for this whole operation
  this.updatedAt = Parse._encode(new Date()).iso;

  if (this.data) {
    // Add default fields
    this.data.updatedAt = this.updatedAt;
    if (!this.query) {
      this.data.createdAt = this.updatedAt;
      this.data.objectId = cryptoUtils.newObjectId();
    }
  }
}

// A convenient method to perform all the steps of processing the
// write, in order.
// Returns a promise for a {response, status, location} object.
// status and location are optional.
RestWrite.prototype.execute = function () {
  var _this = this;

  return Promise.resolve().then(function () {
    return _this.getUserAndRoleACL();
  }).then(function () {
    return _this.validateSchema();
  }).then(function () {
    return _this.handleInstallation();
  }).then(function () {
    return _this.handleSession();
  }).then(function () {
    return _this.runBeforeTrigger();
  }).then(function () {
    return _this.validateAuthData();
  }).then(function () {
    return _this.transformUser();
  }).then(function () {
    return _this.runDatabaseOperation();
  }).then(function () {
    return _this.handleFollowup();
  }).then(function () {
    return _this.runAfterTrigger();
  }).then(function () {
    return _this.response;
  });
};

// Uses the Auth object to get the list of roles, adds the user id
RestWrite.prototype.getUserAndRoleACL = function () {
  var _this2 = this;

  if (this.auth.isMaster) {
    return Promise.resolve();
  }

  this.runOptions.acl = ['*'];

  if (this.auth.user) {
    return this.auth.getUserRoles().then(function (roles) {
      roles.push(_this2.auth.user.id);
      _this2.runOptions.acl = _this2.runOptions.acl.concat(roles);
      return Promise.resolve();
    });
  } else {
    return Promise.resolve();
  }
};

// Validates this operation against the schema.
RestWrite.prototype.validateSchema = function () {
  return this.config.database.validateObject(this.className, this.data, this.query);
};

// Runs any beforeSave triggers against this operation.
// Any change leads to our data being mutated.
RestWrite.prototype.runBeforeTrigger = function () {
  var _this3 = this;

  // Cloud code gets a bit of extra data for its objects
  var extraData = { className: this.className };
  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }
  // Build the inflated object, for a create write, originalData is empty
  var inflatedObject = triggers.inflate(extraData, this.originalData);;
  inflatedObject._finishFetch(this.data);
  // Build the original object, we only do this for a update write
  var originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  return Promise.resolve().then(function () {
    return triggers.maybeRunTrigger('beforeSave', _this3.auth, inflatedObject, originalObject);
  }).then(function (response) {
    if (response && response.object) {
      _this3.data = response.object;
      // We should delete the objectId for an update write
      if (_this3.query && _this3.query.objectId) {
        delete _this3.data.objectId;
      }
    }
  });
};

// Transforms auth data for a user object.
// Does nothing if this isn't a user object.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.validateAuthData = function () {
  if (this.className !== '_User') {
    return;
  }

  if (!this.query && !this.data.authData) {
    if (typeof this.data.username !== 'string') {
      throw new Parse.Error(Parse.Error.USERNAME_MISSING, 'bad or missing username');
    }
    if (typeof this.data.password !== 'string') {
      throw new Parse.Error(Parse.Error.PASSWORD_MISSING, 'password is required');
    }
  }

  if (!this.data.authData) {
    return;
  }

  var authData = this.data.authData;
  var anonData = this.data.authData.anonymous;

  if (this.config.enableAnonymousUsers === true && (anonData === null || anonData && anonData.id)) {
    return this.handleAnonymousAuthData();
  }

  // Not anon, try other providers
  var providers = Object.keys(authData);
  if (!anonData && providers.length == 1) {
    var provider = providers[0];
    var providerAuthData = authData[provider];
    var hasToken = providerAuthData && providerAuthData.id;
    if (providerAuthData === null || hasToken) {
      return this.handleOAuthAuthData(provider);
    }
  }
  throw new Parse.Error(Parse.Error.UNSUPPORTED_SERVICE, 'This authentication method is unsupported.');
};

RestWrite.prototype.handleAnonymousAuthData = function () {
  var _this4 = this;

  var anonData = this.data.authData.anonymous;
  if (anonData === null && this.query) {
    // We are unlinking the user from the anonymous provider
    this.data._auth_data_anonymous = null;
    return;
  }

  // Check if this user already exists
  return this.config.database.find(this.className, { 'authData.anonymous.id': anonData.id }, {}).then(function (results) {
    if (results.length > 0) {
      if (!_this4.query) {
        // We're signing up, but this user already exists. Short-circuit
        delete results[0].password;
        _this4.response = {
          response: results[0],
          location: _this4.location()
        };
        return;
      }

      // If this is a PUT for the same user, allow the linking
      if (results[0].objectId === _this4.query.objectId) {
        // Delete the rest format key before saving
        delete _this4.data.authData;
        return;
      }

      // We're trying to create a duplicate account.  Forbid it
      throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
    }

    // This anonymous user does not already exist, so transform it
    // to a saveable format
    _this4.data._auth_data_anonymous = anonData;

    // Delete the rest format key before saving
    delete _this4.data.authData;
  });
};

RestWrite.prototype.handleOAuthAuthData = function (provider) {
  var _this5 = this;

  var authData = this.data.authData[provider];

  if (authData === null && this.query) {
    // We are unlinking from the provider.
    this.data["_auth_data_" + provider] = null;
    return;
  }

  var appIds;
  var oauthOptions = this.config.oauth[provider];
  if (oauthOptions) {
    appIds = oauthOptions.appIds;
  } else if (provider == "facebook") {
    appIds = this.config.facebookAppIds;
  }

  var validateAuthData;
  var validateAppId;

  if (oauth[provider]) {
    validateAuthData = oauth[provider].validateAuthData;
    validateAppId = oauth[provider].validateAppId;
  }

  // Try the configuration methods
  if (oauthOptions) {
    if (oauthOptions.module) {
      validateAuthData = require(oauthOptions.module).validateAuthData;
      validateAppId = require(oauthOptions.module).validateAppId;
    };

    if (oauthOptions.validateAuthData) {
      validateAuthData = oauthOptions.validateAuthData;
    }
    if (oauthOptions.validateAppId) {
      validateAppId = oauthOptions.validateAppId;
    }
  }
  // try the custom provider first, fallback on the oauth implementation

  if (!validateAuthData || !validateAppId) {
    return false;
  };

  return validateAuthData(authData, oauthOptions).then(function () {
    if (appIds && typeof validateAppId === "function") {
      return validateAppId(appIds, authData, oauthOptions);
    }

    // No validation required by the developer
    return Promise.resolve();
  }).then(function () {
    // Check if this user already exists
    // TODO: does this handle re-linking correctly?
    var query = {};
    query['authData.' + provider + '.id'] = authData.id;
    return _this5.config.database.find(_this5.className, query, {});
  }).then(function (results) {
    _this5.storage['authProvider'] = provider;
    if (results.length > 0) {
      if (!_this5.query) {
        // We're signing up, but this user already exists. Short-circuit
        delete results[0].password;
        _this5.response = {
          response: results[0],
          location: _this5.location()
        };
        _this5.data.objectId = results[0].objectId;
        return;
      }

      // If this is a PUT for the same user, allow the linking
      if (results[0].objectId === _this5.query.objectId) {
        // Delete the rest format key before saving
        delete _this5.data.authData;
        return;
      }
      // We're trying to create a duplicate oauth auth. Forbid it
      throw new Parse.Error(Parse.Error.ACCOUNT_ALREADY_LINKED, 'this auth is already used');
    } else {
      _this5.data.username = cryptoUtils.newToken();
    }

    // This FB auth does not already exist, so transform it to a
    // saveable format
    _this5.data["_auth_data_" + provider] = authData;

    // Delete the rest format key before saving
    delete _this5.data.authData;
  });
};

// The non-third-party parts of User transformation
RestWrite.prototype.transformUser = function () {
  var _this6 = this;

  if (this.className !== '_User') {
    return;
  }

  var promise = Promise.resolve();

  if (!this.query) {
    var token = 'r:' + cryptoUtils.newToken();
    this.storage['token'] = token;
    promise = promise.then(function () {
      var expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      var sessionData = {
        sessionToken: token,
        user: {
          __type: 'Pointer',
          className: '_User',
          objectId: _this6.objectId()
        },
        createdWith: {
          'action': 'login',
          'authProvider': _this6.storage['authProvider'] || 'password'
        },
        restricted: false,
        installationId: _this6.data.installationId,
        expiresAt: Parse._encode(expiresAt)
      };
      if (_this6.response && _this6.response.response) {
        _this6.response.response.sessionToken = token;
      }
      var create = new RestWrite(_this6.config, Auth.master(_this6.config), '_Session', null, sessionData);
      return create.execute();
    });
  }

  return promise.then(function () {
    // Transform the password
    if (!_this6.data.password) {
      return;
    }
    if (_this6.query && !_this6.auth.isMaster) {
      _this6.storage['clearSessions'] = true;
    }
    return passwordCrypto.hash(_this6.data.password).then(function (hashedPassword) {
      _this6.data._hashed_password = hashedPassword;
      delete _this6.data.password;
    });
  }).then(function () {
    // Check for username uniqueness
    if (!_this6.data.username) {
      if (!_this6.query) {
        _this6.data.username = cryptoUtils.randomString(25);
      }
      return;
    }
    return _this6.config.database.find(_this6.className, {
      username: _this6.data.username,
      objectId: { '$ne': _this6.objectId() }
    }, { limit: 1 }).then(function (results) {
      if (results.length > 0) {
        throw new Parse.Error(Parse.Error.USERNAME_TAKEN, 'Account already exists for this username');
      }
      return Promise.resolve();
    });
  }).then(function () {
    if (!_this6.data.email) {
      return;
    }
    // Validate basic email address format
    if (!_this6.data.email.match(/^.+@.+$/)) {
      throw new Parse.Error(Parse.Error.INVALID_EMAIL_ADDRESS, 'Email address format is invalid.');
    }
    // Check for email uniqueness
    return _this6.config.database.find(_this6.className, {
      email: _this6.data.email,
      objectId: { '$ne': _this6.objectId() }
    }, { limit: 1 }).then(function (results) {
      if (results.length > 0) {
        throw new Parse.Error(Parse.Error.EMAIL_TAKEN, 'Account already exists for this email ' + 'address');
      }
      return Promise.resolve();
    });
  });
};

// Handles any followup logic
RestWrite.prototype.handleFollowup = function () {
  if (this.storage && this.storage['clearSessions']) {
    var sessionQuery = {
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.objectId()
      }
    };
    delete this.storage['clearSessions'];
    return this.config.database.destroy('_Session', sessionQuery).then(this.handleFollowup.bind(this));
  }
};

// Handles the _Role class specialness.
// Does nothing if this isn't a role object.
RestWrite.prototype.handleRole = function () {
  if (this.response || this.className !== '_Role') {
    return;
  }

  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  }

  if (!this.data.name) {
    throw new Parse.Error(Parse.Error.INVALID_ROLE_NAME, 'Invalid role name.');
  }
};

// Handles the _Session class specialness.
// Does nothing if this isn't an installation object.
RestWrite.prototype.handleSession = function () {
  var _this7 = this;

  if (this.response || this.className !== '_Session') {
    return;
  }

  if (!this.auth.user && !this.auth.isMaster) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Session token required.');
  }

  // TODO: Verify proper error to throw
  if (this.data.ACL) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, 'Cannot set ' + 'ACL on a Session.');
  }

  if (!this.query && !this.auth.isMaster) {
    var token = 'r:' + cryptoUtils.newToken();
    var expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    var sessionData = {
      sessionToken: token,
      user: {
        __type: 'Pointer',
        className: '_User',
        objectId: this.auth.user.id
      },
      createdWith: {
        'action': 'create'
      },
      restricted: true,
      expiresAt: Parse._encode(expiresAt)
    };
    for (var key in this.data) {
      if (key == 'objectId') {
        continue;
      }
      sessionData[key] = this.data[key];
    }
    var create = new RestWrite(this.config, Auth.master(this.config), '_Session', null, sessionData);
    return create.execute().then(function (results) {
      if (!results.response) {
        throw new Parse.Error(Parse.Error.INTERNAL_SERVER_ERROR, 'Error creating session.');
      }
      sessionData['objectId'] = results.response['objectId'];
      _this7.response = {
        status: 201,
        location: results.location,
        response: sessionData
      };
    });
  }
};

// Handles the _Installation class specialness.
// Does nothing if this isn't an installation object.
// If an installation is found, this can mutate this.query and turn a create
// into an update.
// Returns a promise for when we're done if it can't finish this tick.
RestWrite.prototype.handleInstallation = function () {
  var _this8 = this;

  if (this.response || this.className !== '_Installation') {
    return;
  }

  if (!this.query && !this.data.deviceToken && !this.data.installationId) {
    throw new Parse.Error(135, 'at least one ID field (deviceToken, installationId) ' + 'must be specified in this operation');
  }

  if (!this.query && !this.data.deviceType) {
    throw new Parse.Error(135, 'deviceType must be specified in this operation');
  }

  // If the device token is 64 characters long, we assume it is for iOS
  // and lowercase it.
  if (this.data.deviceToken && this.data.deviceToken.length == 64) {
    this.data.deviceToken = this.data.deviceToken.toLowerCase();
  }

  // TODO: We may need installationId from headers, plumb through Auth?
  //       per installation_handler.go

  // We lowercase the installationId if present
  if (this.data.installationId) {
    this.data.installationId = this.data.installationId.toLowerCase();
  }

  var promise = Promise.resolve();

  if (this.query && this.query.objectId) {
    promise = promise.then(function () {
      return _this8.config.database.find('_Installation', {
        objectId: _this8.query.objectId
      }, {}).then(function (results) {
        if (!results.length) {
          throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found for update.');
        }
        var existing = results[0];
        if (_this8.data.installationId && existing.installationId && _this8.data.installationId !== existing.installationId) {
          throw new Parse.Error(136, 'installationId may not be changed in this ' + 'operation');
        }
        if (_this8.data.deviceToken && existing.deviceToken && _this8.data.deviceToken !== existing.deviceToken && !_this8.data.installationId && !existing.installationId) {
          throw new Parse.Error(136, 'deviceToken may not be changed in this ' + 'operation');
        }
        if (_this8.data.deviceType && _this8.data.deviceType && _this8.data.deviceType !== existing.deviceType) {
          throw new Parse.Error(136, 'deviceType may not be changed in this ' + 'operation');
        }
        return Promise.resolve();
      });
    });
  }

  // Check if we already have installations for the installationId/deviceToken
  var installationMatch;
  var deviceTokenMatches = [];
  promise = promise.then(function () {
    if (_this8.data.installationId) {
      return _this8.config.database.find('_Installation', {
        'installationId': _this8.data.installationId
      });
    }
    return Promise.resolve([]);
  }).then(function (results) {
    if (results && results.length) {
      // We only take the first match by installationId
      installationMatch = results[0];
    }
    if (_this8.data.deviceToken) {
      return _this8.config.database.find('_Installation', { 'deviceToken': _this8.data.deviceToken });
    }
    return Promise.resolve([]);
  }).then(function (results) {
    if (results) {
      deviceTokenMatches = results;
    }
    if (!installationMatch) {
      if (!deviceTokenMatches.length) {
        return;
      } else if (deviceTokenMatches.length == 1 && (!deviceTokenMatches[0]['installationId'] || !_this8.data.installationId)) {
        // Single match on device token but none on installationId, and either
        // the passed object or the match is missing an installationId, so we
        // can just return the match.
        return deviceTokenMatches[0]['objectId'];
      } else if (!_this8.data.installationId) {
        throw new Parse.Error(132, 'Must specify installationId when deviceToken ' + 'matches multiple Installation objects');
      } else {
        // Multiple device token matches and we specified an installation ID,
        // or a single match where both the passed and matching objects have
        // an installation ID. Try cleaning out old installations that match
        // the deviceToken, and return nil to signal that a new object should
        // be created.
        var delQuery = {
          'deviceToken': _this8.data.deviceToken,
          'installationId': {
            '$ne': _this8.data.installationId
          }
        };
        if (_this8.data.appIdentifier) {
          delQuery['appIdentifier'] = _this8.data.appIdentifier;
        }
        _this8.config.database.destroy('_Installation', delQuery);
        return;
      }
    } else {
      if (deviceTokenMatches.length == 1 && !deviceTokenMatches[0]['installationId']) {
        // Exactly one device token match and it doesn't have an installation
        // ID. This is the one case where we want to merge with the existing
        // object.
        var delQuery = { objectId: installationMatch.objectId };
        return _this8.config.database.destroy('_Installation', delQuery).then(function () {
          return deviceTokenMatches[0]['objectId'];
        });
      } else {
        if (_this8.data.deviceToken && installationMatch.deviceToken != _this8.data.deviceToken) {
          // We're setting the device token on an existing installation, so
          // we should try cleaning out old installations that match this
          // device token.
          var delQuery = {
            'deviceToken': _this8.data.deviceToken,
            'installationId': {
              '$ne': _this8.data.installationId
            }
          };
          if (_this8.data.appIdentifier) {
            delQuery['appIdentifier'] = _this8.data.appIdentifier;
          }
          _this8.config.database.destroy('_Installation', delQuery);
        }
        // In non-merge scenarios, just return the installation match id
        return installationMatch.objectId;
      }
    }
  }).then(function (objId) {
    if (objId) {
      _this8.query = { objectId: objId };
      delete _this8.data.objectId;
      delete _this8.data.createdAt;
    }
    // TODO: Validate ops (add/remove on channels, $inc on badge, etc.)
  });
  return promise;
};

RestWrite.prototype.runDatabaseOperation = function () {
  var _this9 = this;

  if (this.response) {
    return;
  }

  if (this.className === '_User' && this.query && !this.auth.couldUpdateUserId(this.query.objectId)) {
    throw new Parse.Error(Parse.Error.SESSION_MISSING, 'cannot modify user ' + this.query.objectId);
  }

  if (this.className === '_Product' && this.data.download) {
    this.data.downloadName = this.data.download.name;
  }

  // TODO: Add better detection for ACL, ensuring a user can't be locked from
  //       their own user record.
  if (this.data.ACL && this.data.ACL['*unresolved']) {
    throw new Parse.Error(Parse.Error.INVALID_ACL, 'Invalid ACL.');
  }

  if (this.query) {
    // Run an update
    return this.config.database.update(this.className, this.query, this.data, this.runOptions).then(function (resp) {
      _this9.response = resp;
      _this9.response.updatedAt = _this9.updatedAt;
    });
  } else {
    // Set the default ACL for the new _User
    if (!this.data.ACL && this.className === '_User') {
      var ACL = {};
      ACL[this.data.objectId] = { read: true, write: true };
      ACL['*'] = { read: true, write: false };
      this.data.ACL = ACL;
    }
    // Run a create
    return this.config.database.create(this.className, this.data, this.runOptions).then(function () {
      var resp = {
        objectId: _this9.data.objectId,
        createdAt: _this9.data.createdAt
      };
      if (_this9.storage['token']) {
        resp.sessionToken = _this9.storage['token'];
      }
      _this9.response = {
        status: 201,
        response: resp,
        location: _this9.location()
      };
    });
  }
};

// Returns nothing - doesn't wait for the trigger.
RestWrite.prototype.runAfterTrigger = function () {
  var extraData = { className: this.className };
  if (this.query && this.query.objectId) {
    extraData.objectId = this.query.objectId;
  }

  // Build the inflated object, different from beforeSave, originalData is not empty
  // since developers can change data in the beforeSave.
  var inflatedObject = triggers.inflate(extraData, this.originalData);
  inflatedObject._finishFetch(this.data);
  // Build the original object, we only do this for a update write.
  var originalObject;
  if (this.query && this.query.objectId) {
    originalObject = triggers.inflate(extraData, this.originalData);
  }

  triggers.maybeRunTrigger('afterSave', this.auth, inflatedObject, originalObject);
};

// A helper to figure out what location this operation happens at.
RestWrite.prototype.location = function () {
  var middle = this.className === '_User' ? '/users/' : '/classes/' + this.className + '/';
  return this.config.mount + middle + this.data.objectId;
};

// A helper to get the object id for this operation.
// Because it could be either on the query or on the data
RestWrite.prototype.objectId = function () {
  return this.data.objectId || this.query.objectId;
};

module.exports = RestWrite;