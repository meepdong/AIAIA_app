// Used by Jest (run from the repo root). The app has its own apps/mobile/babel.config.js for Metro.
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
