'use strict';

// schemas.js

var express = require('express'),
    Parse = require('parse/node').Parse,
    PromiseRouter = require('./PromiseRouter'),
    Schema = require('./Schema');

var router = new PromiseRouter();

function mongoFieldTypeToSchemaAPIType(type) {
  if (type[0] === '*') {
    return {
      type: 'Pointer',
      targetClass: type.slice(1)
    };
  }
  if (type.startsWith('relation<')) {
    return {
      type: 'Relation',
      targetClass: type.slice('relation<'.length, type.length - 1)
    };
  }
  switch (type) {
    case 'number':
      return { type: 'Number' };
    case 'string':
      return { type: 'String' };
    case 'boolean':
      return { type: 'Boolean' };
    case 'date':
      return { type: 'Date' };
    case 'map':
    case 'object':
      return { type: 'Object' };
    case 'array':
      return { type: 'Array' };
    case 'geopoint':
      return { type: 'GeoPoint' };
    case 'file':
      return { type: 'File' };
  }
}

function mongoSchemaAPIResponseFields(schema) {
  var fieldNames = Object.keys(schema).filter(function (key) {
    return key !== '_id' && key !== '_metadata';
  });
  var response = fieldNames.reduce(function (obj, fieldName) {
    obj[fieldName] = mongoFieldTypeToSchemaAPIType(schema[fieldName]);
    return obj;
  }, {});
  response.ACL = { type: 'ACL' };
  response.createdAt = { type: 'Date' };
  response.updatedAt = { type: 'Date' };
  response.objectId = { type: 'String' };
  return response;
}

function mongoSchemaToSchemaAPIResponse(schema) {
  return {
    className: schema._id,
    fields: mongoSchemaAPIResponseFields(schema)
  };
}

function getAllSchemas(req) {
  if (!req.auth.isMaster) {
    return Promise.resolve({
      status: 401,
      response: { error: 'master key not specified' }
    });
  }
  return req.config.database.collection('_SCHEMA').then(function (coll) {
    return coll.find({}).toArray();
  }).then(function (schemas) {
    return { response: {
        results: schemas.map(mongoSchemaToSchemaAPIResponse)
      } };
  });
}

function getOneSchema(req) {
  if (!req.auth.isMaster) {
    return Promise.resolve({
      status: 401,
      response: { error: 'unauthorized' }
    });
  }
  return req.config.database.collection('_SCHEMA').then(function (coll) {
    return coll.findOne({ '_id': req.params.className });
  }).then(function (schema) {
    return { response: mongoSchemaToSchemaAPIResponse(schema) };
  }).catch(function () {
    return {
      status: 400,
      response: {
        code: 103,
        error: 'class ' + req.params.className + ' does not exist'
      }
    };
  });
}

function createSchema(req) {
  if (!req.auth.isMaster) {
    return Promise.resolve({
      status: 401,
      response: { error: 'master key not specified' }
    });
  }
  if (req.params.className && req.body.className) {
    if (req.params.className != req.body.className) {
      return Promise.resolve({
        status: 400,
        response: {
          code: Parse.Error.INVALID_CLASS_NAME,
          error: 'class name mismatch between ' + req.body.className + ' and ' + req.params.className
        }
      });
    }
  }
  var className = req.params.className || req.body.className;
  if (!className) {
    return Promise.resolve({
      status: 400,
      response: {
        code: 135,
        error: 'POST ' + req.path + ' needs class name'
      }
    });
  }
  return req.config.database.loadSchema().then(function (schema) {
    return schema.addClassIfNotExists(className, req.body.fields);
  }).then(function (result) {
    return { response: mongoSchemaToSchemaAPIResponse(result) };
  }).catch(function (error) {
    return {
      status: 400,
      response: error
    };
  });
}

router.route('GET', '/schemas', getAllSchemas);
router.route('GET', '/schemas/:className', getOneSchema);
router.route('POST', '/schemas', createSchema);
router.route('POST', '/schemas/:className', createSchema);

module.exports = router;