'use strict';

require('babel-polyfill');

var _PromiseRouter = require('./PromiseRouter');

var _PromiseRouter2 = _interopRequireDefault(_PromiseRouter);

var _GridStoreAdapter = require('./Adapters/Files/GridStoreAdapter');

var _S3Adapter = require('./Adapters/Files/S3Adapter');

var _FilesController = require('./Controllers/FilesController');

var _ParsePushAdapter = require('./Adapters/Push/ParsePushAdapter');

var _ParsePushAdapter2 = _interopRequireDefault(_ParsePushAdapter);

var _PushController = require('./Controllers/PushController');

var _ClassesRouter = require('./Routers/ClassesRouter');

var _InstallationsRouter = require('./Routers/InstallationsRouter');

var _UsersRouter = require('./Routers/UsersRouter');

var _SessionsRouter = require('./Routers/SessionsRouter');

var _RolesRouter = require('./Routers/RolesRouter');

var _AnalyticsRouter = require('./Routers/AnalyticsRouter');

var _FunctionsRouter = require('./Routers/FunctionsRouter');

var _SchemasRouter = require('./Routers/SchemasRouter');

var _IAPValidationRouter = require('./Routers/IAPValidationRouter');

var _PushRouter = require('./Routers/PushRouter');

var _FilesRouter = require('./Routers/FilesRouter');

var _LogsRouter = require('./Routers/LogsRouter');

var _FileLoggerAdapter = require('./Adapters/Logger/FileLoggerAdapter');

var _LoggerController = require('./Controllers/LoggerController');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var batch = require('./batch'),
    bodyParser = require('body-parser'),
    cache = require('./cache'),
    DatabaseAdapter = require('./DatabaseAdapter'),
    express = require('express'),
    middlewares = require('./middlewares'),
    multer = require('multer'),
    Parse = require('parse/node').Parse,
    httpRequest = require('./httpRequest'); // ParseServer - open-source compatible API Server for Parse apps

// Mutate the Parse object to add the Cloud Code handlers
addParseCloud();

// ParseServer works like a constructor of an express app.
// The args that we understand are:
// "databaseAdapter": a class like ExportAdapter providing create, find,
//                    update, and delete
// "filesAdapter": a class like GridStoreAdapter providing create, get,
//                 and delete
// "databaseURI": a uri like mongodb://localhost:27017/dbname to tell us
//          what database this Parse API connects to.
// "cloud": relative location to cloud code to require, or a function
//          that is given an instance of Parse as a parameter.  Use this instance of Parse
//          to register your cloud code hooks and functions.
// "appId": the application id to host
// "masterKey": the master key for requests to this app
// "facebookAppIds": an array of valid Facebook Application IDs, required
//                   if using Facebook login
// "collectionPrefix": optional prefix for database collection names
// "fileKey": optional key from Parse dashboard for supporting older files
//            hosted by Parse
// "clientKey": optional key from Parse dashboard
// "dotNetKey": optional key from Parse dashboard
// "restAPIKey": optional key from Parse dashboard
// "javascriptKey": optional key from Parse dashboard
// "push": optional key from configure push

function ParseServer(_ref) {
  var appId = _ref.appId;
  var masterKey = _ref.masterKey;
  var databaseAdapter = _ref.databaseAdapter;
  var _ref$filesAdapter = _ref.filesAdapter;
  var filesAdapter = _ref$filesAdapter === undefined ? new _GridStoreAdapter.GridStoreAdapter() : _ref$filesAdapter;
  var push = _ref.push;
  var _ref$loggerAdapter = _ref.loggerAdapter;
  var loggerAdapter = _ref$loggerAdapter === undefined ? new _FileLoggerAdapter.FileLoggerAdapter() : _ref$loggerAdapter;
  var databaseURI = _ref.databaseURI;
  var cloud = _ref.cloud;
  var _ref$collectionPrefix = _ref.collectionPrefix;
  var collectionPrefix = _ref$collectionPrefix === undefined ? '' : _ref$collectionPrefix;
  var _ref$clientKey = _ref.clientKey;
  var clientKey = _ref$clientKey === undefined ? '' : _ref$clientKey;
  var _ref$javascriptKey = _ref.javascriptKey;
  var javascriptKey = _ref$javascriptKey === undefined ? '' : _ref$javascriptKey;
  var _ref$dotNetKey = _ref.dotNetKey;
  var dotNetKey = _ref$dotNetKey === undefined ? '' : _ref$dotNetKey;
  var _ref$restAPIKey = _ref.restAPIKey;
  var restAPIKey = _ref$restAPIKey === undefined ? '' : _ref$restAPIKey;
  var _ref$fileKey = _ref.fileKey;
  var fileKey = _ref$fileKey === undefined ? 'invalid-file-key' : _ref$fileKey;
  var _ref$facebookAppIds = _ref.facebookAppIds;
  var facebookAppIds = _ref$facebookAppIds === undefined ? [] : _ref$facebookAppIds;
  var _ref$enableAnonymousU = _ref.enableAnonymousUsers;
  var enableAnonymousUsers = _ref$enableAnonymousU === undefined ? true : _ref$enableAnonymousU;
  var _ref$oauth = _ref.oauth;
  var oauth = _ref$oauth === undefined ? {} : _ref$oauth;
  var _ref$serverURL = _ref.serverURL;
  var serverURL = _ref$serverURL === undefined ? '' : _ref$serverURL;

  if (!appId || !masterKey) {
    throw 'You must provide an appId and masterKey!';
  }

  if (databaseAdapter) {
    DatabaseAdapter.setAdapter(databaseAdapter);
  }

  // Make push adapter
  var pushConfig = push;
  var pushAdapter = undefined;
  if (pushConfig && pushConfig.adapter) {
    pushAdapter = pushConfig.adapter;
  } else if (pushConfig) {
    pushAdapter = new _ParsePushAdapter2.default(pushConfig);
  }

  if (databaseURI) {
    DatabaseAdapter.setAppDatabaseURI(appId, databaseURI);
  }
  if (cloud) {
    addParseCloud();
    if (typeof cloud === 'function') {
      cloud(Parse);
    } else if (typeof cloud === 'string') {
      require(cloud);
    } else {
      throw "argument 'cloud' must either be a string or a function";
    }
  }

  var filesController = new _FilesController.FilesController(filesAdapter);
  var pushController = new _PushController.PushController(pushAdapter);
  var loggerController = new _LoggerController.LoggerController(loggerAdapter);

  cache.apps[appId] = {
    masterKey: masterKey,
    collectionPrefix: collectionPrefix,
    clientKey: clientKey,
    javascriptKey: javascriptKey,
    dotNetKey: dotNetKey,
    restAPIKey: restAPIKey,
    fileKey: fileKey,
    facebookAppIds: facebookAppIds,
    filesController: filesController,
    pushController: pushController,
    loggerController: loggerController,
    enableAnonymousUsers: enableAnonymousUsers,
    oauth: oauth
  };

  // To maintain compatibility. TODO: Remove in v2.1
  if (process.env.FACEBOOK_APP_ID) {
    cache.apps[appId]['facebookAppIds'].push(process.env.FACEBOOK_APP_ID);
  }

  // Initialize the node client SDK automatically
  Parse.initialize(appId, javascriptKey, masterKey);
  Parse.serverURL = serverURL;

  // This app serves the Parse API directly.
  // It's the equivalent of https://api.parse.com/1 in the hosted Parse API.
  var api = express();

  // File handling needs to be before default middlewares are applied
  api.use('/', new _FilesRouter.FilesRouter().getExpressRouter());

  // TODO: separate this from the regular ParseServer object
  if (process.env.TESTING == 1) {
    api.use('/', require('./testing-routes').router);
  }

  api.use(bodyParser.json({ 'type': '*/*' }));
  api.use(middlewares.allowCrossDomain);
  api.use(middlewares.allowMethodOverride);
  api.use(middlewares.handleParseHeaders);

  var routers = [new _ClassesRouter.ClassesRouter(), new _UsersRouter.UsersRouter(), new _SessionsRouter.SessionsRouter(), new _RolesRouter.RolesRouter(), new _AnalyticsRouter.AnalyticsRouter(), new _InstallationsRouter.InstallationsRouter(), new _FunctionsRouter.FunctionsRouter(), new _SchemasRouter.SchemasRouter(), new _PushRouter.PushRouter(), new _LogsRouter.LogsRouter(), new _IAPValidationRouter.IAPValidationRouter()];

  if (process.env.PARSE_EXPERIMENTAL_CONFIG_ENABLED || process.env.TESTING) {
    routers.push(require('./global_config'));
  }

  var appRouter = new _PromiseRouter2.default();
  routers.forEach(function (router) {
    appRouter.merge(router);
  });
  batch.mountOnto(appRouter);

  appRouter.mountOnto(api);

  api.use(middlewares.handleParseErrors);

  return api;
}

function addParseCloud() {
  Parse.Cloud.Functions = {};
  Parse.Cloud.Validators = {};
  Parse.Cloud.Triggers = {
    beforeSave: {},
    beforeDelete: {},
    afterSave: {},
    afterDelete: {}
  };

  Parse.Cloud.define = function (functionName, handler, validationHandler) {
    Parse.Cloud.Functions[functionName] = handler;
    Parse.Cloud.Validators[functionName] = validationHandler;
  };
  Parse.Cloud.beforeSave = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.beforeSave[className] = handler;
  };
  Parse.Cloud.beforeDelete = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.beforeDelete[className] = handler;
  };
  Parse.Cloud.afterSave = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.afterSave[className] = handler;
  };
  Parse.Cloud.afterDelete = function (parseClass, handler) {
    var className = getClassName(parseClass);
    Parse.Cloud.Triggers.afterDelete[className] = handler;
  };
  Parse.Cloud.httpRequest = httpRequest;
  global.Parse = Parse;
}

function getClassName(parseClass) {
  if (parseClass && parseClass.className) {
    return parseClass.className;
  }
  return parseClass;
}

module.exports = {
  ParseServer: ParseServer,
  S3Adapter: _S3Adapter.S3Adapter
};