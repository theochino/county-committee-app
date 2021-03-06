"use strict";

const fs = require("fs");
const path = require("path");
const extract = require("pdf-text-extract");
const CertifiedList = require("./certified-list-model");
const hooks = require("./hooks");
const CountyCommitteeMember = require("../county-committee-member/county-committee-member-model");
const FeathersMongoose = require("feathers-mongoose");

function ccExtractionException(message) {
  this.message = message;
  this.name = "CCMemberException";
}

class Service extends FeathersMongoose.Service {
  extractCountyFromPage(page) {
    var match = page.match(/IN THE CITY OF NEW YORK\s+(.+), .+Party/);

    if (match) {
      return match[1];
    }
  }

  extractCCMembersFromPage(page) {
    var rows = page.match(/(.+)/g);

    var county = this.extractCountyFromPage(page);
    const party = this.extractPartyFromPage(page);

    var headerRowIndex = rows.findIndex(this.isMemberTableHeaderRow);
    var footerRowIndex = rows.findIndex(this.isMemberTableFooterRow);
    if (headerRowIndex > 0 && footerRowIndex > 0) {
      var ccMemberRows = rows.slice(headerRowIndex + 1, footerRowIndex);

      var errors = [];
      var ccMembers = [];

      ccMemberRows.forEach((memberRow, index) => {
        try {
          ccMembers.push(this.extractCCMemberDataFromRow(memberRow, county));
        } catch (e) {
          errors.push(e);
        }
      });

      return ccMembers;
    }
  }

  extractPartyFromPage(page) {
    var match = page.match(
      /persons were duly elected as\s+(.+)\sCounty Committee/
    );

    if (match) {
      return match[1];
    }
  }

  /**
   * Determines if row is a table header to extract columns
   * and determine where member data is in PDF.
   * @param  {[type]} row [description]
   * @return {[type]}     [description]
   */
  isMemberTableHeaderRow(row) {
    return /Tally\s+Entry Type/.test(row);
  }

  /**
   * Determines if row is a table footer to extract columns
   * and determine where member ends is in PDF.
   * @param  {[type]} row [description]
   * @return {[type]}     [description]
   */
  isMemberTableFooterRow(row) {
    return /Page \d+ of \d+/.test(row);
  }

  //ED/AD Office Holder Address Tally Entry Type
  /**
   * Extracts a member's attributes from a row of text
   * @param  {String} row    [description]
   * @param  {String} county [description]
   * @param  {String} state  [description]
   * @return {Object}        [description]
   */
  extractCCMemberDataFromRow(row, county, state = "NY") {
    if (!county) {
      throw new this.ccExtractionException(
        "County not provided for member row: " + row
      );
    }

    // Data object for CC Member
    let cc_member = {
      petition_number: undefined,
      office: undefined,
      office_holder: undefined,
      address: undefined,
      tally: undefined,
      entry_type: undefined,
      ed_ad: undefined,
      electoral_district: undefined,
      assembly_district: undefined,
      data_source: undefined,
      county: county,
      state: state
    };

    //
    // Lots of gnarly regex logic to parse fields here.
    //
    // You've been warned.
    //

    // Splits up by two space matches.
    // @todo make sure there are no one spaced out items!
    var rowFields = row.split(/\s{2,}/);

    // Edge case for space at begninning
    if (rowFields[0] == "") {
      rowFields.shift();
    }
    // petition checker
    if (!isNaN(rowFields[0])) {
      cc_member.petition_number = rowFields.shift();
    }

    if (/County Committee/i.test(rowFields[0])) {
      cc_member.office = rowFields.shift();
    } else {
      throw new this.ccExtractionException(
        "Petition or position Field Not Valid. " + rowFields[0] + " Row: " + row
      );
    }

    // ED AD extractor
    if (/\d+\/\d+/.test(rowFields[0])) {
      cc_member.ed_ad = rowFields.shift();
      var ed_ad = cc_member.ed_ad.split("/");
      cc_member.electoral_district = parseInt(ed_ad[0], 10);
      cc_member.assembly_district = parseInt(ed_ad[1], 10);
    } else {
      throw new this.ccExtractionException(
        "ED/AD Field Not Valid. " + rowFields[0] + " Row: " + row
      );
    }

    // Office Holder extractor
    if (/Vacancy/i.test(rowFields[0])) {
      cc_member.office_holder = rowFields.shift();
    } else {
      cc_member.office_holder = rowFields.shift();

      //if (/NY/.test(rowFields[0])) {
      cc_member.address = rowFields.shift();
      //} else {
      //    throw 'Address Field Not Valid. ' + rowFields[0] + ' Row: ' + row;
      //}

      if (!isNaN(parseInt(rowFields[0], 10))) {
        cc_member.tally = rowFields.shift();
      } else {
        throw new this.ccExtractionException(
          "Tally Field Not Valid. " + rowFields[0] + " Row: " + row
        );
      }
    }

    if (/.+$/i.test(rowFields[0])) {
      cc_member.entry_type = rowFields.shift();
    }

    return cc_member;
  }

  getCCMembersFromCertifiedListPDF(filepath) {
    return new Promise((resolve, reject) => {
      extract(filepath, (err, pages) => {
        if (err) {
          reject(err);
          console.log(err);
        }

        let members = [];
        let county, party;
        pages.forEach((page, index) => {
          // Keeps checking pages until it can extract county
          // Some pages have county on them others don't
          if (!county) {
            county = this.extractCountyFromPage(page);
          }

          if (!party) {
            party = this.extractPartyFromPage(page);
          }

          const extractedMembers = this.extractCCMembersFromPage(page);

          if (extractedMembers) {
            members = members.concat(
              extractedMembers.map(member => {
                const ccMember = new CountyCommitteeMember(member);
                ccMember.party = party;
                ccMember.data_source = path.basename(filepath);
                return ccMember;
              })
            );
          }
        });

        resolve({
          party: party,
          county: county,
          members: members,
          source: path.basename(filepath)
        });
      });
    });
  }

  create(params) {
    let certifiedList;

    return new Promise((resolve, reject) => {
      if (!fs.existsSync(params.filepath)) {
        reject("File does not exist: " + params.filepath);
        return;
      }
      this.getCCMembersFromCertifiedListPDF(params.filepath).then(
        certifiedList => {
          let importedList = new CertifiedList(certifiedList);
          importedList.save(err => {
            if (err) {
              reject(err);
            } else {
              resolve(importedList);
            }
          });
        }
      );
    });
  }
}

module.exports = function() {
  const app = this;

  const options = {
    Model: CertifiedList,
    paginate: {
      default: 10,
      max: 25
    }
  };

  // Initialize our service with any options it requires
  app.use(app.get("apiPath") + "/certified-list", new Service(options));

  // Get our initialize service to that we can bind hooks
  const certifiedListService = app.service(
    app.get("apiPath") + "/certified-list"
  );

  // Set up our before hooks
  certifiedListService.before(hooks.before);

  // Set up our after hooks
  certifiedListService.after(hooks.after);
};

module.exports.Service = Service;
