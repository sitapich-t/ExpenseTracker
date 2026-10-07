const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Exclude large unrelated directories from being watched
config.resolver.blockList = [
  new RegExp(path.resolve(__dirname, 'ExpenseTracker').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*'),
  new RegExp(path.resolve(__dirname, 'backend').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*'),
  new RegExp(path.resolve(__dirname, 'frontend').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '.*'),
];

module.exports = config;
