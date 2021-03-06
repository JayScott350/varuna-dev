'use strict';

const Shopify = require('shopify-api-node');
const request = require('request-promise');
const path = require('path');
const models = require('../lib/postgres').models;
const Shop = models.shop;
const shipCompliant = require('../lib/ship_compliant');

module.exports.setup = async (ctx, next) => {
  const { first_name, last_name, email, username, password } = ctx.request.body;

  const body = await request({
    uri: `https://${ctx.session.shop}/admin/shop.json`,
    headers: {
      'X-Shopify-Access-Token': ctx.session.access_token
    }
  });

  const hash = await bcrypt.hash(password, 10);
  const { shop } = JSON.parse(body);
  ctx.session.store_id = shop.id;
  const newShop = await Shop.create({
    email,
    password: hash,
    username,
    shopify_shop_name: shop.name,
    myshopify_domain: shop.myshopify_domain,
    custom_domain: shop.domain,
    shopify_shop_id: shop.id,
    first_name,
    last_name
  });
  ctx.redirect('/compliancy-connector/add-ship-compliant');
};

module.exports.addsc = async (ctx, next) => {
  await ctx.render('add-ship-compliant');
};

module.exports.addscp = async (ctx, next) => {
  const { sc_username, sc_password } = ctx.request.body;
  const hash = await bcrypt.hash(sc_password, 10);
  const update = await Shop.update(
    {
      sc_username,
      sc_password: hash
    },
    {
      where: { shopify_shop_id: ctx.session.store_id.toString() },
      returning: true
    }
  );
  await ctx.redirect('/compliancy-connector/home');
};

module.exports.main = async (ctx, next) => {
  await ctx.render('landing', {
    apiKey: process.env.API_KEY,
    shop: ctx.session.shop
  });
};

module.exports.login = async (ctx, next) => {
  await ctx.render('login');
};

module.exports.signup = async (ctx, next) => {
  await ctx.render('signup');
};

module.exports.reports = async (ctx, next) => {
  await ctx.render('reports', { title: 'reports' });
};

module.exports.instructions = async (ctx, next) => {
  await ctx.render('install-instructions', { title: 'install instructions' });
};

module.exports.settings = async (ctx, next) => {
  await ctx.render('settings', { title: 'greetings' });
};

module.exports.inventory = async (ctx, next) => {
  const shopId = ctx.session.shop_id;
  const shop = await Shop.findOne({ where: { id: shopId } });
  const accessToken = shop.shopify_access_token;

  if (!shop) {
    return ctx.respond(404, 'Incorrect username or password');
  }

  const scClient = await shipCompliant.createClient(
    shop.sc_username,
    shop.sc_password
  );
  const response = await scClient.getInventory();
  const inventoryItems =
    response.InventoryLocation[0].InventoryProducts.InventoryProduct;

  const inventoryMap = new Map();

  for (let item of inventoryItems) {
    inventoryMap.set(
      item.ProductKey,
      item.InventoryLevels.InventoryLevel[0].Quantity
    );
  }

  const shopifyResponse = await request({
    method: 'GET',
    url: `https://${shop.myshopify_domain}/admin/products.json`,
    headers: {
      'X-Shopify-Access-Token': accessToken
    }
  });

  //Parse and filter out tax items
  const products = JSON.parse(shopifyResponse).products.filter(product => {
    return product.vendor !== 'VINELINK';
  });

  const productMap = new Map();

  for (let product of products) {
    productMap.set(product.variants[0].sku, product.variants[0].id);
  }

  for (let [sku, inventory_quantity] of inventoryMap) {
    const id = productMap.get(sku);
    request({
      method: 'PUT',
      url: `https://${shop.myshopify_domain}/admin/variants/${id}.json`,
      headers: {
        'X-Shopify-Access-Token': accessToken
      },
      json: true,
      body: {
        variant: {
          id,
          inventory_quantity
        }
      }
    });
  }

  await ctx.respond(200);
};

module.exports.products = async (ctx, next) => {
  await ctx.respond(200);
};

module.exports.addProduct = async (ctx, next) => {};
