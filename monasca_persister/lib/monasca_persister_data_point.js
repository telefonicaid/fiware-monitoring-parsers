/*
 * Copyright 2015 Telefónica I+D
 * All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *         http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 */


/**
 * Module that defines a parser object for Monasca Persister data points.
 *
 * @module monasca_persister_data_point
 * @see https://github.com/openstack/monasca-persister/tree/master/monasca_persister
 */


'use strict';
/* jshint curly: false, -W069 */


var util = require('util');


/**
 * Mapping between Monasca metrics and NGSI attributes
 */
var metricsMappingNGSI = {
    'region.allocated_ip': 'ipAvailable',
    'region.pool_ip': 'ipTot',
    'region.used_ip': 'ipUsed'
};


/**
 * Parser object (extends NGSI Adapter base parser).
 */
var parser = Object.create(null);


/**
 * Parses the request message body to extract Monasca Persister data point.
 *
 * @function parseRequest
 * @memberof parser
 * @param {Domain} reqdomain   Domain handling current request (includes context, timestamp, id, type, body & parser).
 * @returns {EntityData} An object with `data` attribute holding data point, and also `entityType` attribute.
 *
 * Data point is a JSON that should look like this: <code>
 *         {
 *           "measurement": "str",                  // = metric.name, UTF8-encoded
 *           "time": "str",                         // = metric.timestamp in %Y-%m-%dT%H:%M:%S.%fZ format
 *           "fields": {
 *             "value": "...",                      // = metric.value
 *             "value_meta": "..."                  // = metric.value_meta dumped as string
 *           },
 *           "tags": {
 *             "<name#1>": "str",                   // = metric.dimensions[#1]
 *             "<name#2>": "str",                   // = metric.dimensions[#2]
 *             ...
 *             "<name#N>": "str",                   // = metric.dimensions[#N]
 *             "_region": "str",                    // = metric.meta.region
 *             "_tenant_id": "str"                  // = metric.meta.tenantId
 *           }
 *         }
 * </code>
 */
parser.parseRequest = function (reqdomain) {
    var dataPoint = JSON.parse(reqdomain.body);

    // Get region and metric dimensions
    var region = dataPoint.tags['_region'];
    delete dataPoint.tags['_region'];
    delete dataPoint.tags['_tenant_id'];
    var dimensions = dataPoint.tags;

    // EntityType depends on the measurement name and/or dimensions (i.e. tags), and thus EntityId is formatted
    if (dataPoint.measurement.indexOf('region.') === 0) {
        reqdomain.entityType = 'region';
        reqdomain.entityId = region;
    } else if ('component' in dimensions) {
        reqdomain.entityType = 'host_service';
        reqdomain.entityId = util.format('%s:controller:%s', region, dimensions.component);
    } else {
        throw new Error('Data point could not be mapped to a NGSI entity (unknown metric name or dimensions)');
    }

    // Return the data point
    return { data: dataPoint, entityType: reqdomain.entityType };
};


/**
 * Parses data point to extract an object whose members are NGSI context attributes.
 *
 * @function getContextAttrs
 * @memberof parser
 * @param {EntityData} data    Object holding raw entity data and entity type.
 * @returns {Object} Context attributes.
 */
parser.getContextAttrs = function (entityData) {
    var attrs = {};

    // Initially map data point 'value' field as a NGSI attribute with the same name of the measurement (i.e. metric)
    var attrName = entityData.data.measurement,
        attrValue = entityData.data.fields['value'];

    // Additional attributes depending on the entityType
    if (entityData.entityType === 'region') {
        var dataPointMeta = JSON.parse(entityData.data.fields['value_meta']);
        for (var name in dataPointMeta) {
            attrs[name] = dataPointMeta[name];
        }
    } else if (entityData.entityType === 'host_service') {
        var dimensions = entityData.data.tags;
        attrName = dimensions['component'].replace('-', '_');
    }

    // Actually add the measurement as NGSI attribute, possibly applying a name transformation
    attrName = metricsMappingNGSI[attrName] || attrName;
    attrs[attrName] = attrValue;

    return attrs;
};


/**
 * Monasca Persister data point parser.
 */
exports.parser = parser;


/**
 * Metrics to NGSI mapping.
 */
exports.metricsMappingNGSI = metricsMappingNGSI;
