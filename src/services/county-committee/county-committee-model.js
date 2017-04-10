'use strict';

// county-committee-model.js - A mongoose model
// 
// See http://mongoosejs.com/docs/models.html
// for more of what you can do here.

const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const countyCommitteeSchema = new Schema({
    createdAt: {
        type: Date,
        'default': Date.now
    },
    updatedAt: {
        type: Date,
        'default': Date.now
    },
    petition_number: {
        type: Number
    },
    office: {
        type: String,
        required: true
    },
    office_holder: {
        type: String,
        required: true
    },
    address: {
        type: String
    },
    tally: {
        type: Number
    },
    entry_type: {
        type: String,
        required: true
    },
    ed_ad: {
        type: String,
        required: true
    },
    electoral_district: {
        type: Number,
        required: true
    },
    assembly_district: {
        type: Number,
        required: true
    },
    county: {
        type: String,
        required: true
    },
    state: {
        type: String,
        enum: ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'],
        default: 'NY'
    },
    data_source: {
        type: String,
        required: true
    }

});

const countyCommitteeModel = mongoose.model('county-committee', countyCommitteeSchema);

module.exports = countyCommitteeModel;