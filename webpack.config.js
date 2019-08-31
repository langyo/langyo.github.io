var path = require('path');
var webpack = require("webpack");
var UglifyJsPlugin = require('uglify-es-webpack-plugin')

module.exports = {
  mode: 'production',

  entry: './client/index.js',

  output: {
    path: path.resolve(__dirname, 'public'),
    filename: 'bundle.js'
  },

  module: {
    unknownContextCritical: false,
    rules: [
      {
        test: /\.(js)$/,
        exclude: /node_modules/,
        use: 'babel-loader'
      }
    ]
  },

  plugins: [
    new UglifyJsPlugin({})
  ]
};
