// Lets the app `import text from '@content/trust/root_public_key.txt'` (T-08, D-030). The file is
// read when the bundle is built, so trust always follows the committed key: there is no generated
// copy that could go stale and leave demo keys enabled after a real key is committed.
const upstream = require(
  require.resolve('@expo/metro-config/babel-transformer', { paths: [require.resolve('expo/package.json')] }),
);

module.exports.transform = function transform(params) {
  if (params.filename.endsWith('.txt')) {
    return upstream.transform({ ...params, src: `module.exports = ${JSON.stringify(params.src)};` });
  }
  return upstream.transform(params);
};
