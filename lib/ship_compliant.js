'use strict';

const soap = require('soap');
const utils = require('./utils');
const p = utils.promisify;
const _ = require('lodash');

const scMethods = {
  loaded: false
};
async function loadSCMethods () {
  try {
    const coreClient = await p(soap.createClient)(process.env.SC_CORE_URL);
    const supplierClient = await p(soap.createClient)(process.env.SC_SUPPLIER_URL);
    const taxClient = await p(soap.createClient)(process.env.SC_TAX_URL);

    const mapping = {
      getShippingPrefs: p(supplierClient.SupplierService.SupplierServiceSoap12.GetShippingPreferences)
    };
    _.assign(scMethods, mapping);

    scMethods.loaded = true;
    return true;
  } catch (e) {
    console.error('Unable to connect to Ship Compliant and load methods.');
    console.error(e);
    return false;
  }
};
loadSCMethods();

class ShipCompClient {
  constructor (username, password, partnerKey) {
    this.username = username;
    this.password = password;
    this.partnerKey = partnerKey;
  }

  async init () {
    let ok = scMethods.loaded;
    if (!ok) {
      ok = await loadSCMethods();
    }
    return ok;
  }

  async getStateCompliancies () {
    try {
      const response = await scMethods.getShippingPrefs({
        Request: {
          Security: {
            PartnerKey: this.partnerKey,
            Username: this.username,
            Password: this.password,
          }
        }
      });
      if (response.GetShippingPreferencesResult.ResponseStatus !== 'Success') {
        return null;
      }

      const compliancies = response.GetShippingPreferencesResult.StateShippingPreferences.StateShippingPreference;
      const dict = {};
      for (let comp of compliancies) {
        const dos = comp.DirectOffsite;
        dict[comp.State] = {
          compliant: dos.Enabled && dos.ComplianceStatus === 'Compliant',
          override: dos.ComplianceStatus === 'RuleBypassed' ? 'auto' : null
        };
      }
      return dict;
    } catch (e) {
      console.error(e);
      return null;
    }
  }
}

module.exports.createClient = async (username, password) => {
  const partnerKey = process.env.SC_PARTNER_KEY;
  const client = new ShipCompClient(username, password, partnerKey);
  const ok = await client.init();
  if (!ok) {
    return null;
  }
  return client;
};